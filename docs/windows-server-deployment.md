# Windows Server & Cloud VM Deployment Guide

This guide details how to deploy **XianScan** on headless or remote Windows Server environments (such as AWS EC2 `g4dn.2xlarge`, Azure NVv4/NVads, Hetzner GPU instances, or on-prem Windows Server 2022 / 2025).

---

## Table of Contents
1. [Architecture Overview & DirectML Advantage](#architecture-overview--directml-advantage)
2. [Step 1: Install NVIDIA Display Drivers](#step-1-install-nvidia-display-drivers)
3. [Step 2: Configure Windows Firewall](#step-2-configure-windows-firewall)
4. [Step 3: Download & Deploy XianScan](#step-3-download--deploy-xianscan)
5. [Step 4: Verify DirectML Hardware Acceleration](#step-4-verify-directml-hardware-acceleration)
6. [Step 5: Run XianScan as a Persistent Windows Service](#step-5-run-xianscan-as-a-persistent-windows-service)
7. [Step 6: Integrate with Ollama & Gemma 4 Cloud](#step-6-integrate-with-ollama--gemma-4-cloud)
8. [Troubleshooting & Verification](#troubleshooting--verification)

---

## Architecture Overview & DirectML Advantage

Unlike Linux deployments that require configuring CUDA toolkits, matching cuDNN versions, and linking runtime libraries, the Windows build of XianScan uses **DirectML (DirectX 12)**:

- **Zero CUDA/cuDNN Configuration**: DirectML is built into the Windows OS (`DirectML.dll`).
- **Vendor Agnostic**: Accelerates seamlessly across NVIDIA (GeForce, RTX, Tesla, Quadro), AMD (Radeon), and Intel (Arc) discrete GPUs.
- **Headless Cloud Server Caveat**: Fresh Windows Server installations default to the software-rendered `Microsoft Basic Display Adapter`. DirectML requires a physical GPU display driver to activate hardware acceleration. Once the driver is installed, DirectML immediately binds to your GPU with zero extra steps.

---

## Step 1: Install NVIDIA Display Drivers

On cloud VMs (like AWS EC2 G4dn), install the official NVIDIA driver package.

### Automated Driver Installation (AWS EC2)

Open PowerShell as Administrator on your Windows Server:

```powershell
# 1. Install AWS CLI if not present
$cliUrl = "https://awscli.amazonaws.com/AWSCLIV2.msi"
$cliOut = "$env:TEMP\AWSCLIV2.msi"
Invoke-WebRequest -Uri $cliUrl -OutFile $cliOut -UseBasicParsing
Start-Process msiexec.exe -ArgumentList "/i `"$cliOut`" /qn" -Wait

# 2. Download the AWS-certified NVIDIA GRID driver from S3
New-Item -ItemType Directory -Force -Path "C:\NVIDIA" | Out-Null
& "C:\Program Files\Amazon\AWSCLIV2\aws.exe" s3 cp --no-sign-request s3://ec2-windows-nvidia-drivers/latest/596.86__grid_win10_win11_server2022_server2025_dch_64bit_international_aws_swl.exe C:\NVIDIA\installer.exe

# 3. Silently install driver without rebooting
Start-Process -FilePath "C:\NVIDIA\installer.exe" -ArgumentList "-s -clean -noreboot" -Wait
```

### Verify GPU Status
Run `nvidia-smi` to confirm the GPU is active:
```powershell
nvidia-smi
```

You should see your GPU (e.g., `Tesla T4`, `15360 MiB`) listed with driver status `OK`.

---

## Step 2: Configure Windows Firewall

Cloud network interfaces are automatically assigned to the **Public** firewall profile. Ensure inbound rules apply across all network profiles:

```powershell
# Allow XianScan Web Studio (Port 8124)
New-NetFirewallRule -Name "XianScan-Web-8124" -DisplayName "XianScan Web Studio" -Protocol TCP -LocalPort 8124 -Action Allow -Profile Any

# Allow XianScan ML API & Health Checks (Port 8123)
New-NetFirewallRule -Name "XianScan-ML-8123" -DisplayName "XianScan ML API" -Protocol TCP -LocalPort 8123 -Action Allow -Profile Any
```

> [!IMPORTANT]
> Also ensure your Cloud Provider Security Group (e.g. AWS Security Group, Azure NSG) has inbound rules allowing ports `8124` and `8123` from your IP.

---

## Step 3: Download & Deploy XianScan

```powershell
# 1. Create directory
New-Item -ItemType Directory -Force -Path "C:\xianscan"
Set-Location -Path "C:\xianscan"

# 2. Download latest Windows release bundle
$url = "https://github.com/ArbenApura/xianscan-rust/releases/download/v0.5.0-beta.1/xianscan-windows-x86_64.zip"
Invoke-WebRequest -Uri $url -OutFile "C:\xianscan\xianscan-windows-x86_64.zip" -UseBasicParsing

# 3. Extract release
Expand-Archive -Path "C:\xianscan\xianscan-windows-x86_64.zip" -DestinationPath "C:\xianscan" -Force
```

---

## Step 4: Verify DirectML Hardware Acceleration

Start XianScan in a PowerShell console:

```powershell
cd C:\xianscan
.\xianscan.exe
```

In a second console or browser, query the hardware telemetry API:

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8123/system/hardware" | ConvertTo-Json -Depth 5
```

### Expected Output:
```json
{
  "device_label": "DirectML Dedicated GPU (NVIDIA Tesla T4)",
  "active_provider": "DmlExecutionProvider",
  "has_directml": true,
  "has_dedicated_gpu": true,
  "detected_gpus": [
    {
      "name": "NVIDIA Tesla T4",
      "vram_mb": 15081.2,
      "is_dedicated": true
    }
  ]
}
```

---

## Step 5: Run XianScan as a Persistent Windows Service

To keep XianScan running 24/7 without needing an active RDP or SSH session, register it as a Windows Scheduled Task:

```powershell
$action = New-ScheduledTaskAction -Execute "C:\xianscan\xianscan.exe" -WorkingDirectory "C:\xianscan"
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskName "XianScanService" -Action $action -Trigger $trigger -Principal $principal -Force
Start-ScheduledTask -TaskName "XianScanService"
```

---

## Step 6: Integrate with Ollama & Gemma 4 Cloud

Running an LLM via **Ollama Cloud** offloads text generation to cloud infrastructure, reserving 100% of your server's VRAM for XianScan's RF-DETR bubble detector and LaMa inpainting models.

### 1. Install Ollama for Windows
```powershell
$url = "https://ollama.com/download/OllamaSetup.exe"
$out = "$env:TEMP\OllamaSetup.exe"
Invoke-WebRequest -Uri $url -OutFile $out -UseBasicParsing
Start-Process -FilePath $out -ArgumentList "/silent" -Wait
```

### 2. Register Ollama as a Headless Background Task
```powershell
$action = New-ScheduledTaskAction -Execute "C:\Users\Administrator\AppData\Local\Programs\Ollama\ollama.exe" -Argument "serve"
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskName "OllamaService" -Action $action -Trigger $trigger -Principal $principal -Force
Start-ScheduledTask -TaskName "OllamaService"
```

### 3. Connect to Ollama Cloud
Run `signin` to generate your authorization link:
```powershell
& "C:\Users\Administrator\AppData\Local\Programs\Ollama\ollama.exe" signin
```
Follow the generated URL in your browser to authorize your server instance.

### 4. Pull Gemma 4 Cloud
```powershell
& "C:\Users\Administrator\AppData\Local\Programs\Ollama\ollama.exe" pull gemma4:cloud
```

### 5. Configure XianScan Web Studio
1. Open the Web Studio at `http://<your-server-ip>:8124`.
2. Go to **Settings** -> **Translation Model Configuration**.
3. Select **Ollama** as the provider:
   - **Endpoint URL**: `http://localhost:11434`
   - **Model**: `gemma4:cloud`
4. Click **Test Connection & Save**.

---

## Troubleshooting & Verification

| Issue | Cause | Solution |
| :--- | :--- | :--- |
| `active_provider` shows `CPUExecutionProvider` | GPU driver missing or using Basic Display Adapter | Install official NVIDIA/AMD graphics driver and verify with `nvidia-smi` or `Get-CimInstance Win32_VideoController`. |
| Cannot access port 8124 from remote browser | Windows Defender Firewall or Cloud Security Group blocking port | Run `New-NetFirewallRule ... -Profile Any` and check AWS/cloud security group inbound rules. |
| Ollama GUI fails on headless server | No active desktop session | Run `ollama serve` directly or register as a background Scheduled Task running under `SYSTEM`. |
| SSH connection timed out | Default port 22 blocked by Windows Firewall on Public profile | Run `Set-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -Profile Any -Enabled True`. |
