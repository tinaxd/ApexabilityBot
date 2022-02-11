import express from 'express';

export class WebAPI {
    private app: express.Express;

    constructor() {
        this.app = express();
        this.app.use(express.json());

        this.app.post('/apexability/start', (req, res) => {
            const username = req.body.username;
            console.log(`/apexability/start by ${username}`);
            res.send(200);
        });

        this.app.post('/apexability/stop', (req, res) => {
            const username = req.body.username;
            console.log(`/apexability/stop by ${username}`);
            res.send(200);
        });
    }

    start() {
        const port = 8051;
        this.app.listen(port, () => {
            console.log(`[Web] listening on port ${port}`);
        })
    }
}
