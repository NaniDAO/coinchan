# Internationalization in Coinchan

This document provides an overview of how internationalization (i18n) is implemented in the Coinchan application.

## Technologies Used

- **react-i18next**: The i18n library used for translating the application
- **i18next-browser-languagedetector**: Automatically detects user's preferred language

## Setup

The i18n system is initialized in `/src/i18n/index.ts`, which:

1. Imports translation files
2. Configures language detection
3. Sets up fallback behavior
4. Initializes the i18n instance

All translation files are located in `/src/i18n/locales/` with one file per language (e.g., `en.json`, `zh.json`).

## Translation Structure

Translation files are organized in a nested JSON structure, with keys grouped by component or feature areas:

```json
{
  "common": {
    "loading": "Loading...",
    "error": "Error",
    ...
  },
  "swap": {
    "title": "Swap",
    "from": "From",
    ...
  },
  ...
}
```

## Usage in Components

To use translations in a component:

1. Import the `useTranslation` hook:
   ```typescript
   import { useTranslation } from 'react-i18next';
   ```

2. Initialize the hook in your component:
   ```typescript
   const { t } = useTranslation();
   ```

3. Use the `t()` function to translate content:
   ```typescript
   <Button>{t('common.send')}</Button>
   ```

## Language Switching

The application includes a `LanguageSwitcher` component (`/src/components/LanguageSwitcher.tsx`) that allows users to change the application language. Language preferences are stored in the browser's localStorage.

## Adding a New Language

To add support for a new language:

1. Create a new translation file in `/src/i18n/locales/` (e.g., `es.json` for Spanish)
2. Copy the structure from an existing language file and translate all values
3. Update the language resources in `/src/i18n/index.ts`:
   ```typescript
   const resources = {
     en: { translation: translationEN },
     zh: { translation: translationZH },
     es: { translation: translationES } // Add the new language
   };
   ```
4. Add the new language to the `LanguageSwitcher` component's language options

## Best Practices

1. **Use Namespaces**: Keep translations organized by feature or component
2. **Avoid String Concatenation**: Use placeholders for dynamic content instead
   ```typescript
   // Good
   t('greeting', { name: userName })
   // Bad
   t('hello') + ' ' + userName
   ```
3. **Use Key Hierarchy**: Create logical groupings of keys
4. **Keep Keys Consistent**: Use the same key structure across different language files
5. **Document Non-obvious Keys**: Add comments for translations that need context

## Commands

- To extract new translations: (TODO)
- To validate translations: (TODO)