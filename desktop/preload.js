/* Yetflix preload - the ONLY bridge between the site and the desktop.
 * Exposes vlc playback for codec-limited Multi Dub links (MKV / Dolby /
 * DTS are silent in Chromium; VLC decodes everything). */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("yetflixVlc", {
  play: (url, headers) => ipcRenderer.invoke("vlc-play", url, headers),
});
