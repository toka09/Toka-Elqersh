# Gift guide Shopify theme

Two custom sections build the gift guide page inside the full Shopify Horizon theme. Their markup, product popup, variant controls, and cart panel use custom code. The gift guide template excludes Horizon's header, footer, cart drawer, search modal, and quick-add modal.

## Start here

| Review task | File or function |
| --- | --- |
| Page composition: banner followed by product grid | [templates/page.gift-guide.json](templates/page.gift-guide.json) |
| Banner layout, mobile menu, text and image settings | [sections/gift-guide-banner.liquid](sections/gift-guide-banner.liquid) |
| Product blocks, popup/cart markup, companion setting | [sections/gift-guide-grid.liquid](sections/gift-guide-grid.liquid) |
| Shopify product/cart requests | `storefrontApi` in [assets/gift-guide.js](assets/gift-guide.js) |
| Actual variant selection and Black/Medium companion rule | `getSelectedVariant`, `isBlackMedium` in the same script |
| Product and cart HTML | `renderOptions`, `renderProduct`, `renderCartPanel` in the same script |
| Clicks, forms, keyboard handling, editor lifecycle | `createGiftGuideController`, `initialize` in the same script |
| Responsive styling | [assets/gift-guide.css](assets/gift-guide.css) |
| Excluding standard components from the gift guide | [layout/theme.liquid](layout/theme.liquid), [snippets/scripts.liquid](snippets/scripts.liquid) |
| Companion behavior on other Horizon pages | [assets/soft-winter-jacket.js](assets/soft-winter-jacket.js) |

## Code organization

The JavaScript uses a controller factory: each grid receives its own state and named event handlers, plus a `destroy` method that removes listeners and cancels product loading when the theme editor unloads that section. A `WeakMap` prevents duplicate initialization. Shopify requests share one API adapter; rendering functions handle markup separately from events.

Product options come from Shopify's actual variants. An unavailable combination cannot silently select a different color. Cart mutations are guarded while a request is pending, and removal uses the cart line key. Dialogs support Escape, keyboard focus wrapping, and focus restoration.

The custom script stays in one asset to keep deployment simple. Type annotations support the JavaScript checker; comments explaining browser or Shopify constraints are retained in the base theme.

## Folder map

| Folder | Purpose |
| --- | --- |
| `assets/` | JavaScript, CSS, images, icons, and type declarations |
| `sections/` | Page sections and their theme-editor settings; the two custom sections use the `gift-guide-` prefix |
| `templates/` | Page composition and saved section/block settings |
| `blocks/` | Horizon's reusable theme-editor blocks |
| `snippets/` | Horizon's shared Liquid markup and integration code |
| `layout/` | Shared document shells |
| `config/` | Theme-wide settings definitions and saved values |
| `locales/` | Storefront and theme-editor translations |
| `scripts/`, `tests/` | Development checks, excluded from Shopify uploads by `.shopifyignore` |

The standard Shopify folders stay in place so the complete theme can be uploaded. Horizon author metadata and Shopify editor-generated notices identify the inherited files accurately.

## Configure the page

Assign the `gift-guide` template to a page. In the theme editor, select up to six products in **Gift guide product grid** and choose **Soft Winter Jacket companion**.

For a Black and M/Medium variant, the companion is added in the same cart request. If the section setting is empty, lookup uses the theme's companion setting, the `soft-winter-jacket` handle, then a matching title among products available in the `all` collection response. Explicit selection is the reliable configuration for any catalog size. If no available companion variant exists, the chosen main item still adds and the cart shows an availability notice.

## Run the checks

Install Node.js and Shopify CLI, then run:

```sh
npm ci
npm run check:structure
npm run check:js
npm test
npm run check:theme
```

The structure check covers all eight theme folders, JSON files, Liquid schemas, static asset/snippet references, and the two-section template. Browser tests use the real gift guide JavaScript and CSS with simulated Shopify responses; they do not change a store cart. Chrome or Edge is required; set `CHROME_PATH` if installed elsewhere.

Theme Check currently reports one inherited warning: `sections/header.liquid` has 42 settings. That header is excluded from the gift guide page. A live Shopify preview is still needed to verify store products and final visual matching.
