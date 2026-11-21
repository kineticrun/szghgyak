# Vizsgarendszer – modulonkénti JSON-betöltés

A rendszer a `modulok/01.json`–`modulok/25.json` fájlokat tölti be. A hiányzó fájlokat automatikusan kihagyja; egy hibás modul sem akadályozza a többi betöltését.

A JSON-ok eredeti kérdésobjektum-szerkezete változatlan:
`id`, `fejezet`, `kerdes`, `valasz`, `magyarazat`.

A fájlok tartalmát a `modulok` mappában cserélheted a saját kérdéseidre. A fájloknak JSON-tömböt kell tartalmazniuk. GitHub Pagesen vagy helyi webszerveren futtasd, ne `file://` címmel.
