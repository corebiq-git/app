COREBIQ MODULE PACKAGE
======================

This package keeps the supplied index.html visual CSS/design unchanged.
Only the module loader has been extended so each module can load its own CSS from /module-css/.

Structure:
  index.html                  Main app shell (style preserved)
  firebase-config.js          Shared Firebase Auth + Firestore config
  module-css/*.css            Per-module styles
  header.html, sidebar.html, bottomnav.html  Shared shell components
  *.html                      Module HTML fragments/pages

Important:
- The module loader automatically loads module-css/<module>.css when a module opens.
- The module CSS is scoped to its module root so it does not overwrite the header/footer/index styling.
- Existing module scripts are re-executed by the existing loader.
- Some modules referenced by the current index map were not present as standalone files in the available project files at build time (management, staff, attendance, users, office-details, letterhead, seal, updates, licenceinfo, aboutapp, privacy, backup, calc, dev). They are therefore not fabricated here.
