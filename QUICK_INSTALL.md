# GazeConnect Pro - Quick Install Guide

**Follow these exact steps to build the installer.**

> This guide assumes you move the project to `C:\GC` to avoid Windows Long Path errors.

---

### 1. Move Project to Short Path

1. **Copy** the entire `gazeconnect_v3` folder.
2. **Paste** it directly into `C:\`.
3. **Rename** the folder to `GC`.
   - Path is now: `C:\GC\`

### 2. Clean Previous Artifacts

```powershell
.\clean.bat
```

### 3. Install Dependencies

Re-install Node.js and Python packages for the new location:

```powershell
.\setup.bat
```

### 4. Copy Tobii DLLs

Ensure the eye tracker libraries are ready:

```powershell
.\copy-tobii-dlls.bat
```

### 5. Build Installer

```powershell
.\build-installer.bat
```

---

### Output

The installer will be generated in:

**`C:\GC\release\`**

File: `GazeConnect Pro Setup *.exe`

---

For detailed build documentation, see [Build and Installation Guide](docs/build-and-installation-guide.md).

For floor-plan usage after install/setup:
- End users (UI only): [Floor Plan End User Guide](docs/floorplan-end-user-guide.md)
- Developers/scripts: [Latest Script Quick Start](docs/latest-script-quick-start.md)
- Full data/session flow: [Home Planning End-to-End Guide](docs/home-planning-end-to-end-guide.md)
