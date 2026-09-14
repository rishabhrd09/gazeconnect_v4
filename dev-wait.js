const http = require('http');

const CANDIDATE_URLS = ['http://127.0.0.1:5173', 'http://localhost:5173'];
const MAX_WAIT = 60000; // 60 seconds max
const POLL_INTERVAL = 500;

console.log("Waiting for Vite server to be ready...");

const start = Date.now();

function checkVite() {
    if (Date.now() - start > MAX_WAIT) {
        console.error("Vite did not become ready on port 5173. Electron was not started. Check the development log.");
        process.exit(1);
        return;
    }

    let pending = CANDIDATE_URLS.length;
    let ready = false;

    const onNotReady = () => {
        pending -= 1;
        if (!ready && pending <= 0) {
            setTimeout(checkVite, POLL_INTERVAL);
        }
    };

    CANDIDATE_URLS.forEach((viteUrl) => {
        let settled = false;
        const failed = () => {
            if (settled) return;
            settled = true;
            onNotReady();
        };
        const req = http.get(viteUrl, (res) => {
            res.resume();
            if (!ready && res.statusCode === 200) {
                settled = true;
                ready = true;
                console.log(`Vite server is ready at ${viteUrl}. Starting Electron...`);
                process.exit(0);
                return;
            }
            failed();
        });

        req.on('error', failed);

        req.setTimeout(1000, () => {
            req.destroy();
            failed();
        });
    });
}

checkVite();
