import express from 'express';
import path from 'path';
import { OmniRouteService } from './services/omniroute';

const app = express();
const port = 20128;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
    res.render('index');
});

app.post('/connect', async (req, res) => {
    const { baseUrl, apiKey } = req.body;
    const omniRoute = new OmniRouteService(baseUrl, apiKey);
    const connected = await omniRoute.checkConnection();
    res.send(connected ? 'Kết nối thành công!' : 'Kết nối thất bại!');
});

app.listen(port, () => {
    console.log(`Bridge server running at http://localhost:${port}`);
});
