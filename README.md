# shouldersofgiants
Educational History Card Game

## Running locally

Don't open `index.html` directly or serve the folder with a generic static
server (e.g. `python3 -m http.server`) — Python's built-in server declares
`.m4a` files as `audio/mp4a-latm`, a MIME type Safari's `<audio>` element
refuses to play (it plays fine in Firefox/Chrome, which is what made this
easy to miss). Sounds will silently fail to play in Safari only.

Instead, run the project's own zero-dependency dev server, which declares
the correct `audio/mp4` for `.m4a`:

```
node tools/map-editor/serve.js
```

Then open `http://localhost:8750/`. (It also serves the map editor itself at
`http://localhost:8750/tools/map-editor/`, off the same process.)
