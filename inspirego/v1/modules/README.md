Each module has three files:

- `<module>.html` — markup
- `<module>.js` — exported `init()` function
- `<module>.css` — optional module-specific CSS (not required for the sample)

Do not put `<script>` tags in dynamically injected module HTML.
Use `export async function init(){...}` in the module JS instead.
