const express = require("express");
const app = express();
const PORT = process.env.PORT || 5000;
app.use(express.static("."));
app.get(/(.*)/, (req, res) => res.sendFile("index.html", { root: "." }));
app.listen(PORT, "0.0.0.0", () => console.log("Dive Calculator listening on " + PORT));
