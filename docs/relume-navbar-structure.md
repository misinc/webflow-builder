# Relume navbar structure (learned from real components)

Captured via the playground clipboard inspector from real Relume navbar
components, so the migrator emits Relume's canonical structure/naming instead of
inventing its own.

**These are Webflow NATIVE Navbar elements** (the Navigator shows the Navbar/
Menu-Button element icons, not plain divs). The responsive menu button + dropdown
open/close is **built into the element** (Webflow's `.w-nav` runtime) and rides
the clipboard as part of the node `type` + `data` — NOT a custom IX2 interaction.
So emitting these node types reproduces a working navbar. The migrator emits them
with generic `navbar_*` classes + the source's styling (see payload.ts
`buildNavbarTree`).

## Native node types + data (learned from Relume's clipboard)

Each node needs a specific Webflow `type` and `data`:

- `NavbarWrapper` (div): `data.navbar={type:"wrapper",collapse:"medium",easing:"ease",
  easing2:"ease",duration:400,docHeight:false,noScroll:false,animation:"default"}`,
  `data.attr={data-collapse:"medium",data-animation:"default",data-duration:"400"}`
- `NavbarBrand` (a): `data.navbar={type:"brand"}`, `data.attr.href="#"`, `data.link.mode="external"`
- `NavbarMenu` (nav): `data.navbar={type:"menu"}`, `data.attr.role="navigation"`
- `NavbarLink` (a): `data.navbar={type:"link"}`, `data.link={url:"#",mode:"external"}`
- `NavbarButton` (div): `data.navbar={type:"button"}`  ← the hamburger; native w-nav shows/hides it responsively
- `DropdownWrapper` (div): `data.dropdown={type:"wrapper"}`, `data.attr={data-delay:"200",data-hover:true}`
- `DropdownToggle` (div): `data.dropdown={type:"toggle"}`
- `DropdownList` (nav): `data.dropdown={type:"list"}`
- `DropdownLink` (a): `data.dropdown={type:"link"}`, `data.link={url:"#",mode:"external"}`

Serialized via the `BuildNode.webflowType` / `webflowData` passthrough in
`@wfb/shared/webflow-clipboard.ts`.

## Canonical vocabulary

Root → container → [logo] [menu] [hamburger]:

- `navbar{N}_component` (div, root)
  - `navbar{N}_container` (div)
    - `navbar{N}_logo-link` (a) → `navbar{N}_logo` (img)
    - `navbar{N}_menu` (nav)
      - **Navbar1:** one `navbar{N}_menu-links` group holding links + dropdowns
      - **Navbar5:** split `navbar{N}_menu-left` + `navbar{N}_menu-right`
      - `navbar{N}_link` (a) — each top-level nav link
      - `navbar{N}_menu-dropdown` (div)
        - `navbar{N}_dropdown-toggle` (div) → label `div` + `dropdown-chevron`
        - `navbar{N}_dropdown-list` (nav)
          - simple: `navbar{N}_dropdown-link` (a) × N
          - mega (navbar5): rich content — see below
      - `navbar{N}_menu-buttons` (Navbar1) / buttons inside `menu-right` (Navbar5)
        - `button` (a) + combos: `&is-secondary`, `&is-small`, `&is-link`, `&is-icon`
    - `navbar{N}_menu-button` (div, the hamburger)
      - `menu-icon1`
        - `menu-icon1_line-top`
        - `menu-icon1_line-middle` → `menu-icon1_line-middle-inner`
        - `menu-icon1_line-bottom`

Navbar tablet state combo seen: `navbar1_menu .&is-page-height-tablet`.

## Mega-menu extras (navbar5 dropdown-list)

- `navbar5_dropdown-content` → `navbar5_dropdown-content-left` + `_content-right`
- Left: `navbar5_dropdown-column` → heading (`text-size-small &text-weight-semibold`)
  + `navbar5_dropdown-link-list` → `navbar5_dropdown-link` rows, each:
  `navbar5_icon-wrapper` (→ `icon-embed-xsmall`) + `navbar5_item-right`
  (title `&text-weight-semibold` + `p.text-size-small.&hide-mobile-landscape`)
- Right: `navbar5_dropdown-content-wrapper &z-index-1` → featured `navbar5_blog-list`
  → `navbar5_blog-item` (`navbar5_blog-image-wrapper` > img `navbar5_blog-image`,
  `navbar5_large-item-content`), plus `button-group` with `button &is-link &is-icon`.
- `navbar5_dropdown-background-layer &background-color-secondary`.

## Utility classes referenced

`margin-bottom &margin-xsmall/-tiny/-xxsmall`, `margin-top`, `text-size-small`,
`text-weight-semibold`, `text-style-link`, `icon-embed-xsmall/-xxsmall`,
`hide-mobile-landscape`, `background-color-secondary`, `z-index-1`, `button-group`.

## Migration mapping (planned)

Map a source navbar's parts into the Navbar1 skeleton (the common case):
logo `<img>` → `navbar_logo` inside `navbar_logo-link`; top nav `<a>` → `navbar_link`;
a link with a submenu → `navbar_menu-dropdown` (toggle + `navbar_dropdown-list` of
`navbar_dropdown-link`); CTA `<a>`/buttons → `navbar_menu-buttons` with `button`
(+ `&is-secondary` for outline/ghost styles); always emit the `navbar_menu-button`
+ `menu-icon` hamburger. Because the output uses the **native Navbar element
types**, the responsive menu button and dropdown open/close work on paste with no
manual interaction wiring. Dropdowns from arbitrary source markup are not yet
detected (v1 flattens submenu links to top-level `navbar_link`).
