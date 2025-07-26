# Custom File Order

A powerful VS Code extension that allows you to customize the ordering of files and folders in the Explorer panel.

## Features

- 🎯 **Custom File/Folder Ordering**: Set custom order for any folder
- 🖱️ **Drag & Drop Interface**: Reorder items with intuitive drag & drop
- 🎨 **Visual Configuration Panel**: Easy-to-use interface for managing rules
- 📋 **Project Templates**: Apply predefined ordering for React, Vue, Node.js projects
- ⚡ **Auto-Refresh**: Automatically updates when files change
- 🎯 **Context Menus**: Right-click to access ordering options

## Usage

1. **View Custom Order Panel**: Look for "Custom File Order" in the Explorer sidebar
2. **Set Custom Order**: Right-click on any folder → "Set Custom Order for This Folder"
3. **Reorder Items**: Use "Move Up" / "Move Down" context menu options
4. **Configuration Panel**: Click the gear icon to open the visual configuration panel
5. **Apply Templates**: Use "Apply Project Template" for common project structures

## Examples

### React Project Structure
```json
{
  "customFileOrder.rules": {
    "src": {
      "order": ["App.jsx", "index.js", "components", "hooks", "pages", "utils", "assets"],
      "type": "manual"
    }
  }
}