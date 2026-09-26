# Linux NVIDIA GPU (CUDA & cuDNN) Acceleration Guide

This guide sets up NVIDIA GPU acceleration for **XianScan** on Linux (Ubuntu 24.04 or newer, Debian 13, and cloud VMs such as AWS EC2 G4dn/G5/G6, Lambda Labs or RunPod).

---

## Table of Contents
1. [Overview](#overview)
2. [Hardware & Software Requirements](#hardware--software-requirements)
3. [Step 1: Install the NVIDIA Driver, CUDA 13 and cuDNN 9](#step-1-install-the-nvidia-driver-cuda-13-and-cudnn-9)
4. [Step 2: Download XianScan and Check Its Libraries](#step-2-download-xianscan-and-check-its-libraries)
5. [Step 3: Launch XianScan](#step-3-launch-xianscan)
6. [Step 4: Run as a Persistent System Service (Optional)](#step-4-run-as-a-persistent-system-service-optional)
7. [Step 5: Pair with Local Ollama for Fast Translation (Optional)](#step-5-pair-with-local-ollama-for-fast-translation-optional)
8. [Troubleshooting & Verification](#troubleshooting--verification)

---

## Overview

XianScan runs on the CPU by default. When an NVIDIA GPU with the right driver and libraries is present, its bundled ONNX Runtime uses the `CUDAExecutionProvider` for detection, OCR and inpainting, which is many times faster than the CPU.

The Linux release ships ONNX Runtime 1.28 built for **CUDA 13**. Setups made for CUDA 12 (driver 550, `nvidia-cudnn-cu12`) do not work with it; XianScan then stays on the CPU.

---

## Hardware & Software Requirements

| Component | Requirement |
| :--- | :--- |
| **GPU** | NVIDIA GPU supported by CUDA 13 (Turing / RTX 20 series, Tesla T4 or newer), 6 GB or more of VRAM recommended |
| **Linux OS** | Ubuntu 24.04 LTS or newer, or another distribution of the same age (the release is built on Ubuntu 24.04 and needs its C library) |
| **NVIDIA Driver** | 580 or newer |
| **CUDA Runtime** | CUDA 13.x (for example `libcudart.so.13`, `libcublas.so.13`, `libcublasLt.so.13`) |
| **cuDNN** | cuDNN 9 built for CUDA 13 |

---

## Step 1: Install the NVIDIA Driver, CUDA 13 and cuDNN 9

### 1. Add NVIDIA's CUDA repository
Follow [NVIDIA's CUDA downloads page](https://developer.nvidia.com/cuda-downloads) for your distribution (choose the `deb (network)` installer). On Ubuntu 24.04 this is:

```bash
wget https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2404/x86_64/cuda-keyring_1.1-1_all.deb
sudo dpkg -i cuda-keyring_1.1-1_all.deb
sudo apt-get update
```

### 2. Install the driver, the CUDA 13 toolkit and cuDNN 9
```bash
sudo apt-get install -y linux-headers-$(uname -r) nvidia-driver-580-server cuda-toolkit-13-0 cudnn9-cuda-13
sudo reboot
```

If the `nouveau` driver keeps the NVIDIA driver from loading, blacklist it and reboot again:

```bash
echo "blacklist nouveau" | sudo tee /etc/modprobe.d/blacklist-nouveau.conf
echo "options nouveau modeset=0" | sudo tee -a /etc/modprobe.d/blacklist-nouveau.conf
sudo update-initramfs -u
sudo reboot
```

### 3. Verify the driver
```bash
nvidia-smi
```
It should list your GPU and show **CUDA Version: 13.0** or higher in the header.

*(Optional: `sudo nvidia-smi -pm 1` enables persistence mode, which avoids driver reload delays. XianScan also tries this at startup, but it only works when XianScan runs as root.)*

---

## Step 2: Download XianScan and Check Its Libraries

```bash
mkdir -p ~/xianscan-app && cd ~/xianscan-app
wget https://github.com/ArbenApura/xianscan-rust/releases/latest/download/xianscan-linux-x86_64.tar.gz
tar -xzf xianscan-linux-x86_64.tar.gz
chmod +x xianscan
```

The archive contains `xianscan` and the ONNX Runtime GPU libraries (`libonnxruntime_providers_cuda.so`, `libonnxruntime_providers_shared.so` and others). Keep them in the same folder.

Check that every library the CUDA provider needs can be found:

```bash
export LD_LIBRARY_PATH="$HOME/xianscan-app:/usr/local/cuda/lib64:$LD_LIBRARY_PATH"
ldd ./libonnxruntime_providers_cuda.so | grep "not found"
```

No output means everything is found. Any library listed as `not found` is missing or not on `LD_LIBRARY_PATH` (see [Common Errors](#2-common-errors-and-solutions)).

---

## Step 3: Launch XianScan

```bash
cd ~/xianscan-app
export LD_LIBRARY_PATH="$HOME/xianscan-app:/usr/local/cuda/lib64:$LD_LIBRARY_PATH"
./xianscan
```

The startup log should report CUDA and your GPU.

---

## Step 4: Run as a Persistent System Service (Optional)

On a dedicated server or cloud VM, run XianScan with `systemd` so it restarts automatically:

```bash
sudo tee /etc/systemd/system/xianscan.service > /dev/null << 'UNIT'
[Unit]
Description=XianScan Translation Server
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/xianscan-app
ExecStart=/home/ubuntu/xianscan-app/xianscan --lan
Restart=always
RestartSec=5
Environment=PORT=8124
Environment=LD_LIBRARY_PATH=/home/ubuntu/xianscan-app:/usr/local/cuda/lib64
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable --now xianscan
```

`--lan` makes XianScan listen on the network (it is loopback-only by default; leave it out if you only reach XianScan through a tunnel on the same machine). Other devices need the access token once; print it as the service user:
```bash
sudo -u ubuntu /home/ubuntu/xianscan-app/xianscan --print-token
```

Data is stored in the service user's `~/.local/share/xianscan/data`. To keep it elsewhere, add `Environment=XDG_DATA_HOME=/srv/xianscan` (this moves the database, images and token together).

Check status anytime with:
```bash
sudo systemctl status xianscan
journalctl -u xianscan -f
```

---

## Step 5: Pair with Local Ollama for Fast Translation (Optional)

You can run a local translation LLM on the same GPU. `qwen3.5:4b` translates comic dialogue well while using only about 4 GB of VRAM (XianScan's default is the larger `qwen3.5:9b`).

```bash
# 1. Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# 2. Pull Qwen 3.5 4B
ollama pull qwen3.5:4b

# 3. Create a 10k context profile (fully on the GPU)
cat << 'EOF' > Modelfile
FROM qwen3.5:4b
PARAMETER num_ctx 10240
PARAMETER num_gpu 99
EOF
ollama create qwen3.5:4b-10k -f Modelfile

# 4. Keep the model loaded in VRAM (no cold-start delay)
sudo mkdir -p /etc/systemd/system/ollama.service.d
sudo tee /etc/systemd/system/ollama.service.d/override.conf > /dev/null << 'EOF'
[Service]
Environment="OLLAMA_KEEP_ALIVE=-1"
EOF

sudo systemctl daemon-reload
sudo systemctl restart ollama
```

### Selecting Ollama in the Web Studio

Open **http://localhost:8124** (or your server address, where you paste the access token on the unlock page once):

1. Open **Settings** (gear icon) -> **AI Translation Providers**.
2. Click **Switch Provider** and choose **Ollama (Local)**.
3. Select **`qwen3.5:4b-10k`** as the **Model** (use the model scan if it is not listed yet).
4. Click **Save & Set Active**.

---

## Troubleshooting & Verification

### 1. Verify Active Hardware in the Studio

#### A. Settings -> Hardware & Compute
- The status badge shows the active accelerator, for example `CUDA Dedicated GPU (Tesla T4)`.
- The **NVIDIA CUDA (Linux/WSL)** device card is selected.
- **GPU VRAM Allocation Limit** shows the active limit (`Auto`, `4 GB`, `6 GB`, `8 GB`, `12 GB`, `16 GB`).
- The telemetry gauges show GPU VRAM use, GPU load and host RAM, refreshed every 2 seconds.

#### B. Page Inspector
Open a translated page, then **OCR Pipeline**. The diagnostics show the backend (for example `CUDAExecutionProvider (Tesla T4)`) and the time of each stage.

#### C. Terminal
On the server itself (no token needed; the internal ML port 8123 refuses this request):
```bash
curl -s http://127.0.0.1:8124/api/system/hardware | jq
```
Expected output:
```json
{
  "device_label": "CUDA Dedicated GPU (Tesla T4)",
  "active_provider": "CUDAExecutionProvider",
  "providers": ["CUDAExecutionProvider", "CPUExecutionProvider"],
  "has_cuda": true,
  "has_dedicated_gpu": true,
  "detected_gpus": [
    {
      "device_id": 0,
      "name": "Tesla T4",
      "vendor_id": 4318,
      "vram_mb": 15360.0,
      "is_dedicated": true,
      "is_integrated": false
    }
  ]
}
```

---

### 2. Common Errors and Solutions

#### `libcublasLt.so.13` or `libcudart.so.13: cannot open shared object file`
- **Cause**: The CUDA 13 runtime is missing or not on the library path. A CUDA 12 install does not provide these files.
- **Fix**: Install `cuda-toolkit-13-0` (Step 1) and include `/usr/local/cuda/lib64` in `LD_LIBRARY_PATH`. Re-run the `ldd` check from Step 2.

#### `dlopen failed for libcudnn.so` / `cuDNN is unavailable` (or a silent fallback to CPU)
- **Cause**: cuDNN 9 for CUDA 13 (`libcudnn.so.9` and its modules `libcudnn_cnn`, `libcudnn_ops`, `libcudnn_graph`) is missing. The CUDA 12 build (`nvidia-cudnn-cu12`, `cudnn9-cuda-12`) does not work with this release.
- **Fix**: `sudo apt-get install cudnn9-cuda-13`, then `sudo ldconfig`, and restart XianScan.

#### `nvidia-smi` shows CUDA 12.x
- **Cause**: The driver is too old for CUDA 13.
- **Fix**: Install driver 580 or newer (`nvidia-driver-580-server`) and reboot.

#### Stuck on CPU after a GPU error
- **Cause**: When a CUDA session fails to start (usually a missing library), XianScan records the failure and loads later models on the CPU, so a broken setup does not fail every page.
- **Fix**: Fix the library problem above, then pick **NVIDIA CUDA** again in **Settings -> Hardware & Compute**, or restart XianScan.

#### Out of Memory (OOM) when running Ollama + XianScan together
- **Cause**: Both services compete for GPU VRAM.
- **Fix**: Open **Settings -> Hardware & Compute -> GPU VRAM Allocation Limit** and select `6 GB` or `8 GB` (recommended for a Tesla T4 with 15 GB). Avoid a fixed `ORT_CUDA_MEM_LIMIT_MB` in systemd unless necessary; XianScan sizes each model's allocation automatically.
