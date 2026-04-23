const http = require('http');

const CANDIDATE_URLS = ['http://127.0.0.1:5173', 'http://localhost:5173'];
const MAX_WAIT = 60000; // 60 seconds max
const POLL_INTERVAL = 500;

console.log("Waiting for Vite server to be ready...");

const start = Date.now();

function checkVite() {
    if (Date.now() - start > MAX_WAIT) {
        console.log("Timed out waiting for Vite. Starting Electron anyway...");
        process.exit(0);
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
        const req = http.get(viteUrl, (res) => {
            // Any non-5xx response means HTTP server is up.
            if (!ready && res.statusCode && res.statusCode < 500) {
                ready = true;
                console.log(`Vite server is ready at ${viteUrl}. Starting Electron...`);
                process.exit(0);
                return;
            }
            onNotReady();
        });

        req.on('error', onNotReady);

        req.setTimeout(1000, () => {
            req.destroy();
            onNotReady();
        });
    });
}

checkVite();
