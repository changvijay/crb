# Debugging Guide for ChangMarketReport

## Quick Start

### Option 1: Debug with Break at Startup (Recommended)
1. **Open the debugger**: Press `Shift + D` or go to View > Debug
2. **Select "Debug Server"** from the dropdown at the top
3. **Click the Play button** (or press `F5`)
4. The server will pause on the first line - press the **Continue button** (or `F5`) to proceed
5. Set breakpoints anywhere in your code by clicking the line number
6. When code hits a breakpoint, you can:
   - Hover over variables to see values
   - Use the Debug Console to inspect and run commands
   - Step through code (F10 = step over, F11 = step into)

### Option 2: Attach to Already-Running Server
1. **Start the server** manually: `npm run debug:attach` in terminal
2. Open Debug view and select **"Attach to Running Server"**
3. Click Play button to connect
4. Set breakpoints and debug as normal

### Option 3: Command Line Only
```bash
npm run debug        # Start with break at startup
npm run debug:attach # Start normally, allowing debugger to connect
```

## Features Configured
✅ **Environment variables** loaded from `.env` automatically  
✅ **Auto-restart** when you save files (while debugging)  
✅ **Inspector protocol** for modern debugging  
✅ **Skip node internals** - cleaner stack traces  
✅ **Integrated terminal** - see output right in VS Code  

## Debug Console Commands
While paused at a breakpoint, you can type in the Debug Console:
- `someVariable` - inspect a variable
- `typeof something` - check types
- `JSON.stringify(obj, null, 2)` - pretty-print objects

## Common Breakpoint Tips
- **Click on a line number** to set a breakpoint
- **Right-click a breakpoint** to add conditions (e.g., `i > 100`)
- **Conditional breakpoints** let you debug just the cases you care about
