import express from 'express';
import path from 'path';
import { OmniRouteService } from './services/omniroute';
import { OpenClawService } from './services/openclaw';

const app = express();
const port = 3000; // Cổng cho Bridge Dashboard

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const openClawService = new OpenClawService();

app.get('/', (req, res) => {
    res.render('index');
});

app.post('/api/omniroute/check', async (req, res) => {
    const { baseUrl, apiKey } = req.body;
    try {
        const omniRoute = new OmniRouteService(baseUrl, apiKey);
        const connected = await omniRoute.checkConnection();
        if (connected) {
            const models = await omniRoute.getModels();
            res.json({ connected: true, models });
        } else {
            res.json({ connected: false, error: 'Không thể truy cập API' });
        }
    } catch (error) {
        res.json({ connected: false, error: error.message });
    }
});

app.get('/api/openclaw/status', async (req, res) => {
    const installed = await openClawService.isInstalled();
    res.json({ installed });
});

app.post('/api/openclaw/configure', async (req, res) => {
    const { baseUrl, apiKey, model } = req.body;
    // Tạm thời trả về thông báo, logic ghi file sẽ hoàn thiện sau
    res.json({ message: `Đã nhận yêu cầu cấu hình OpenClaw với model ${model}` });
});

app.listen(port, () => {
    console.log(`Dashboard running at http://localhost:${port}`);
});
