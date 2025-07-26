# Custom File Order

A powerful VS Code extension that allows you to customize the ordering of files and folders in the Explorer panel.

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
```
## 📄 License
This project is open source and available under the [MIT License](./LICENSE).
And am not enough for building a Extension so i keep it open source :>