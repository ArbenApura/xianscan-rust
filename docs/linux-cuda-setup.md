# Linux NVIDIA GPU (CUDA & cuDNN) Acceleration Guide

This guide walks you through setting up native NVIDIA GPU acceleration for **XianScan** on Linux distributions (Ubuntu 22.04 / 24.04 / 26.04, Debian 12+, and cloud VMs like AWS EC2 G4dn/G5/G6, Lambda Labs, RunPod).

---

## Table of Contents
1. [Overview](#overview)
2. [Hardware & Software Requirements](#hardware--software-requirements)
3. [Step 1: Install NVIDIA Driver & CUDA Toolkit](#step-1-install-nvidia-driver--cuda-toolkit)
4. [Step 2: Install NVIDIA cuDNN Libraries](#step-2-install-nvidia-cudnn-libraries)
5. [Step 3: Download & Launch XianScan](#step-3-download--launch-xianscan)
6. [Step 4: Run as a Persistent System Service (Optional)](#step-4-run-as-a-persistent-system-service-optional)
7. [Step 5: Pair with Local Ollama for Fast Translation (Optional)](#step-5-pair-with-local-ollama-for-fast-translation-optional)
8. [Troubleshooting & Verification](#troubleshooting--verification)

---

## Overview

XianScan is built to be CPU-first and completely self-contained. When executed on an ordinary Linux machine without a GPU, it runs on an optimized multi-threaded SIMD CPU engine.

When a compatible NVIDIA discrete GPU is present with the proper driver and CUDA/cuDNN runtimes, XianScan's embedded ONNX Runtime activates the `CUDAExecutionProvider`, dropping page inference time (bubble detection, multi-language OCR, and neural inpainting) from ~10 seconds down to **under 2 seconds**.

---

## Hardware & Software Requirements

| Component | Minimum | Recommended |
| :--- | :--- | :--- |
| **GPU** | NVIDIA Pascal+ (GTX 1060, RTX 20/30/40/50 series, Tesla T4, A10G, L4) | 6 GB to 16 GB dedicated VRAM |
| **Linux OS** | Ubuntu 22.04 LTS / 24.04 LTS / 26.04 LTS, Debian 12+ | Ubuntu 24.04 LTS / 26.04 LTS |
| **NVIDIA Driver** | `>= 535.xx` (Server or Desktop) | `550.xx` or `580.xx` |
| **CUDA Runtime** | CUDA 12.x or 13.x | CUDA 12.4+ / 13.0 |
| **cuDNN** | NVIDIA cuDNN 9.x (`libcudnn.so`) | `nvidia-cudnn-cu12` (v9.x) |

---

## Step 1: Install NVIDIA Driver & CUDA Toolkit

### 1. Disable the conflicting open-source `nouveau` driver
The open-source `nouveau` driver can prevent the proprietary NVIDIA kernel modules from initializing the GPU.

```bash
# Blacklist nouveau
echo "blacklist nouveau" | sudo tee /etc/modprobe.d/blacklist-nouveau.conf
echo "options nouveau modeset=0" | sudo tee -a /etc/modprobe.d/blacklist-nouveau.conf

# Rebuild initramfs
sudo update-initramfs -u
```

### 2. Install kernel headers, driver, and CUDA toolkit
```bash
sudo apt-get update -y
sudo apt-get install -y linux-headers-$(uname -r) nvidia-driver-550-server nvidia-cuda-toolkit
sudo reboot
```

### 3. Verify driver detection
After the reboot finishes, verify that the driver and CUDA compiler are active:
```bash
nvidia-smi
nvcc --version
```

*(Optional: Enable persistence mode to avoid driver reload latencies: `sudo nvidia-smi -pm 1`)*

---

## Step 2: Install NVIDIA cuDNN Libraries

> [!IMPORTANT]
> **Why is cuDNN required?**  
> ONNX Runtime's CUDA convolution kernels (used for the **RF-DETR** layout detector and **RapidOCR** text recognition) dynamically link against `libcudnn.so`. Without cuDNN, inference will fall back to CPU.

The cleanest and fastest way to install official cuDNN on any Linux distribution is via the official NVIDIA wheel:

```bash
# 1. Install pip (if not already installed)
sudo apt-get install -y python3-pip

# 2. Install NVIDIA cuDNN 9
pip install --break-system-packages nvidia-cudnn-cu12

# 3. Symlink cuDNN shared objects to the system library path
sudo ln -sf ~/.local/lib/python3.*/site-packages/nvidia/cudnn/lib/libcudnn*.so* /usr/lib/x86_64-linux-gnu/
sudo ldconfig
```

---

## Step 3: Download & Launch XianScan

### 1. Download and extract the latest Linux release
```bash
mkdir -p ~/xianscan-app && cd ~/xianscan-app

# Download Linux binary release
wget https://github.com/ArbenApura/xianscan-rust/releases/latest/download/xianscan-linux-x86_64.tar.gz

# Extract
tar -xzf xianscan-linux-x86_64.tar.gz
chmod +x xianscan
```

### 2. Launch XianScan with CUDA environment variables
```bash
# Include the app folder and CUDA system libraries in LD_LIBRARY_PATH
export LD_LIBRARY_PATH="$HOME/xianscan-app:/usr/lib/x86_64-linux-gnu:/usr/local/cuda/lib64:$LD_LIBRARY_PATH"

./xianscan
```

---

## Step 4: Run as a Persistent System Service (Optional)

If you are hosting XianScan on a dedicated server or cloud VM (e.g. AWS EC2, Hetzner), configure `systemd` to keep XianScan running 24/7 with automatic restart:

```bash
sudo tee /etc/systemd/system/xianscan.service > /dev/null << 'UNIT'
[Unit]
Description=XianScan Translation Server
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/xianscan-app
ExecStart=/home/ubuntu/xianscan-app/xianscan
Restart=always
RestartSec=5
Environment=PATH=/usr/local/cuda/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/home/ubuntu/.cargo/bin
Environment=LD_LIBRARY_PATH=/home/ubuntu/xianscan-app:/usr/lib/x86_64-linux-gnu:/usr/local/cuda/lib64
Environment=ORT_CUDA_MEM_LIMIT_MB=8192
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable --now xianscan
```

Check status anytime with:
```bash
sudo systemctl status xianscan
journalctl -u xianscan -f
```

---

## Step 5: Pair with Local Ollama for Fast Translation (Optional)

You can run local translation LLMs on the same GPU alongside XianScan. `qwen3.5:4b` provides exceptional CJK comic dialogue translation while occupying only ~4 GB of VRAM.

```bash
# 1. Install Ollama
curl -fsSL https://ollama.com/install.sh | sh

# 2. Pull Qwen 3.5 4B
ollama pull qwen3.5:4b

# 3. Create a 10k context profile (100% GPU offloaded)
cat << 'EOF' > Modelfile
FROM qwen3.5:4b
PARAMETER num_ctx 10240
PARAMETER num_gpu 99
EOF
ollama create qwen3.5:4b-10k -f Modelfile

# 4. Set Ollama to keep the model loaded in VRAM permanently (zero cold-start latency)
sudo mkdir -p /etc/systemd/system/ollama.service.d
sudo tee /etc/systemd/system/ollama.service.d/override.conf > /dev/null << 'EOF'
[Service]
Environment="OLLAMA_KEEP_ALIVE=-1"
EOF

sudo systemctl daemon-reload
sudo systemctl restart ollama
```

### 5. Selecting Ollama in the Web Studio

Open **http://localhost:8124** (or your server domain) in your browser:

1. Open **Settings** (gear icon).
2. Go to **AI Translation Providers** (or click the **Local & Offline** filter pill).
3. Select **Ollama**:
   - Click **Scan Models** to discover `qwen3.5:4b-10k`.
   - Select **`qwen3.5:4b-10k`** from the model list.
   - Click **Set Active Engine** (this marks Ollama as the active translation engine with the `ACTIVE` badge).

---

## Troubleshooting & Verification

### 1. Verify Active Hardware & Performance in the Studio

XianScan includes built-in live telemetry and inspection tools inside the Web Studio:

#### A. Settings Modal (`Hardware & Compute` Tab)
- **Active Accelerator Status**: The badge in the top-right displays `Active: CUDA Dedicated GPU (Tesla T4)` in green.
- **Compute Device Selector**: The **NVIDIA CUDA (Linux/WSL)** card is highlighted with an active checkmark.
- **GPU VRAM Allocation Limit**: Shows `Active Limit: 8 GB` (or your chosen preset) with preset selector cards (`Auto`, `4 GB`, `6 GB`, `8 GB`, `12 GB`, `16 GB`).
- **Live System Telemetry Gauge**: Displays real-time auto-refreshing gauges (2.0s interval) for:
  - **GPU VRAM Usage**: Live MB consumed vs. total VRAM (e.g. `4125 MB / 15360 MB (27%)`).
  - **GPU Load**: Real-time compute utilization percentage.
  - **Host System RAM**: Process memory and total system RAM.

#### B. Page OCR Stats Inspector Modal
When viewing any translated chapter page in the reader:
- Click the **OCR Stats / Telemetry** button on a page card.
- In the modal overview, verify:
  - **Backend / Device**: Shows `CUDAExecutionProvider (Tesla T4)`.
  - **Total Pipeline Duration**: `detector_time_ms` + `ocr_fullpage_time_ms` + `inpaint_time_ms` executing in **< 1500 ms**.

#### C. Terminal Verification (CLI)
You can also inspect the raw JSON endpoint directly:
```bash
curl -s http://127.0.0.1:8123/system/hardware | jq
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

#### `cuDNN is unavailable or disabled for CUDA Execution Provider: dlopen failed for libcudnn.so`
- **Cause**: `libcudnn.so` is missing from `/usr/lib/x86_64-linux-gnu` or `LD_LIBRARY_PATH`.
- **Fix**: Re-run [Step 2](#step-2-install-nvidia-cudnn-libraries) and make sure `sudo ldconfig` was run.

#### `libcublasLt.so.13 or libcudart.so.13: cannot open shared object file`
- **Cause**: The bundled ONNX runtime binary expects a newer or specific CUDA dynamic library path.
- **Fix**: Ensure your `LD_LIBRARY_PATH` includes the directory holding `libcublasLt.so` and `libcudart.so` (e.g. `/usr/local/cuda/lib64` or `/usr/local/lib/ollama/cuda_v13`).

#### Out of Memory (OOM) when running Ollama + XianScan together
- **Cause**: Both services trying to allocate all available GPU VRAM.
- **Fix**: Open **Settings -> Hardware & Compute -> GPU VRAM Allocation Limit** and select `6 GB` or `8 GB` (Tesla T4 / 3070+), or set `Environment=ORT_CUDA_MEM_LIMIT_MB=6144` in your systemd service.
