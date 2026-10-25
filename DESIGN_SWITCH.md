# Design selection

The root `index.html` loads `design-switch.js`. Selection order is:

1. `?design=new` selects `index-modern.html`.
2. `?design=old` or `?design=classic` selects `index-classic.html`.
3. Otherwise, `config.json` controls the selection through `useNewDesign`.
4. If the configuration cannot be read, the classic frontend is used.

Query parameters are retained during the redirect. The modern redirect also
adds a fixed deployment version parameter so browsers do not reuse an older
cached HTML shell after an upgrade.

Example configuration:

```json
{
  "useNewDesign": true
}
```

