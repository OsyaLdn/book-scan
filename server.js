const express = require('express');
const path = require('path');

const app = express();
const PORT = 8001;

// Serve static files from the current directory
app.use(express.static(path.join(__dirname)));

// Define a catch-all route to handle undefined routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html')); // Adjust if your entry file is different
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});
