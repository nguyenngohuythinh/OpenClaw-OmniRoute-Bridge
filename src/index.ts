import express from 'express';
import axios from 'axios';

const app = express();
const port = 20128; // Mặc định OmniRoute chạy ở 20128

app.use(express.json());

// Dummy API endpoint for checking OmniRoute status
app.get('/api/omniroute/status', async (req, res) => {
    try {
        const response = await axios.get('http://127.0.0.1:20128/v1/models');
        res.json({ status: 'connected', data: response.data });
    } catch (error) {
        res.status(500).json({ status: 'disconnected', error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Bridge server running at http://localhost:${port}`);
});
