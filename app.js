const VERSION = "v2.1";

const state = {
    images: [],
    clusters: [],
    currentIndex: 0,
    flags: { KEEP: new Set(), REJECT: new Set() },
    ratings: {},
    view: 'CAROUSEL',
    helpOpen: false
};

const UI = {
    startup: document.getElementById('startup'),
    workspace: document.getElementById('workspace'),
    hud: document.getElementById('hud'),
    carousel: document.getElementById('carousel-view'),
    zoom: document.getElementById('zoom-view'),
    compare: document.getElementById('compare-view'),
    compareLeft: document.getElementById('compare-left'),
    compareRight: document.getElementById('compare-right'),
    count: document.getElementById('stat-count'),
    ringKeep: document.getElementById('svg-keep'),
    ringReject: document.getElementById('svg-reject'),
    burst: document.getElementById('stat-burst'),
    flag: document.getElementById('current-flag'),
    rating: document.getElementById('current-rating'),
    helpBtn: document.getElementById('btn-help'),
    helpModal: document.getElementById('hotkey-modal'),
    closeHelp: document.getElementById('btn-close-help'),
    startupVersion: document.getElementById('startup-version'),
    hudVersion: document.getElementById('hud-version'),
    arSelect: document.getElementById('ar-select')
};

UI.startupVersion.innerText = VERSION;
UI.hudVersion.innerText = VERSION;

/* -------------------------
   MEMORY-SAFE IMAGE LAYER
------------------------- */

// Lazy loader
async function ensureImageURL(img) {
    if (!img.url) {
        const file = await img.handle.getFile();
        img.url = URL.createObjectURL(file);
    }
    return img.url;
}

// Cleanup everything not in carousel window
function cleanupURLs(activeIndexes) {
    state.images.forEach((img, i) => {
        if (!activeIndexes.includes(i) && img.url) {
            URL.revokeObjectURL(img.url);
            img.url = null;
        }
    });
}

/* -------------------------
   INPUT / FILE SYSTEM
------------------------- */

document.getElementById('btn-open').addEventListener('click', async () => {
    try {
        const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        await scanImages(dirHandle);
        bootEngine();
    } catch (err) {
        console.log("Cancelled:", err);
    }
});

async function scanImages(dirHandle) {
    let rawImages = [];
    let count = 0;

    for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file' && entry.name.match(/\.(jpg|jpeg|png|webp)$/i)) {
            const file = await entry.getFile();

            rawImages.push({
                handle: entry,
                name: entry.name,
                timestamp: file.lastModified,
                url: null // IMPORTANT: no preload
            });

            count++;

            // yield every 50 files
            if (count % 50 === 0) {
                await new Promise(r => setTimeout(r, 0));
            }
        }
    }

    rawImages.sort((a, b) => a.timestamp - b.timestamp);
    state.images = rawImages;
    groupBursts();
}

/* -------------------------
   BURST LOGIC
------------------------- */

function groupBursts() {
    state.clusters = [];
    let current = [];

    state.images.forEach((img, i) => {
        img.index = i;

        if (i === 0) {
            current.push(img);
            return;
        }

        const delta = img.timestamp - state.images[i - 1].timestamp;

        if (delta < 1500) {
            current.push(img);
        } else {
            state.clusters.push(current);
            current = [img];
        }
    });

    if (current.length) state.clusters.push(current);
}

function getActiveBurst() {
    return state.clusters.find(c =>
        c.some(img => img.index === state.currentIndex)
    );
}

/* -------------------------
   ENGINE BOOT
------------------------- */

function bootEngine() {
    UI.startup.classList.add('hidden');
    UI.workspace.classList.remove('hidden');
    UI.hud.classList.remove('hidden');

    updateView();
    registerHotkeys();
}

/* -------------------------
   RENDER ENGINE
------------------------- */

async function renderCarousel() {
    if (state.images.length === 0) return;

    const nodes = [
        document.getElementById('c-node-0'),
        document.getElementById('c-node-1'),
        document.getElementById('c-node-2'),
        document.getElementById('c-node-3'),
        document.getElementById('c-node-4')
    ];

    nodes.forEach(n => n.className = 'carousel-slot');

    const activeIndexes = [];

    for (let i = -2; i <= 2; i++) {
        const targetIndex = state.currentIndex + i;
        const domIndex = ((targetIndex % 5) + 5) % 5;
        const node = nodes[domIndex];

        let posClass = 'pos-0';
        if (i === -2) posClass = 'pos-n2';
        if (i === -1) posClass = 'pos-n1';
        if (i === 1) posClass = 'pos-p1';
        if (i === 2) posClass = 'pos-p2';

        node.classList.add(posClass);

        if (targetIndex >= 0 && targetIndex < state.images.length) {
            activeIndexes.push(targetIndex);
            const imgData = state.images[targetIndex];

            let imgEl = node.querySelector('img');
            if (!imgEl) {
                imgEl = document.createElement('img');
                node.appendChild(imgEl);
            }

            try {
                imgEl.src = await ensureImageURL(imgData);
            } catch {
                node.classList.add('empty-slot');
            }

        } else {
            node.classList.add('empty-slot');
        }
    }

    cleanupURLs(activeIndexes);
}

async function updateView() {
    if (state.images.length === 0) return;

    const img = state.images[state.currentIndex];

    UI.carousel.classList.toggle('hidden', state.view !== 'CAROUSEL');
    UI.zoom.classList.toggle('hidden', state.view !== 'ZOOM');
    UI.compare.classList.toggle('hidden', state.view !== 'COMPARE');

    if (state.view === 'CAROUSEL') {
        await renderCarousel();
    }

    if (state.view === 'ZOOM') {
        UI.zoom.style.backgroundImage =
            `url('${await ensureImageURL(img)}')`;
    }

    if (state.view === 'COMPARE') {
        const burst = getActiveBurst();

        UI.compareLeft.style.backgroundImage =
            `url('${await ensureImageURL(img)}')`;

        let compareImg = img;

        if (burst && burst.length > 1) {
            const idx = burst.findIndex(b => b.index === img.index) + 1;
            compareImg = burst[idx] || burst[idx - 2];
        }

        UI.compareRight.style.backgroundImage =
            `url('${await ensureImageURL(compareImg)}')`;
    }

    updateHUD();
}

/* -------------------------
   UI
------------------------- */

function updateHUD() {
    const total = state.images.length;
    if (!total) return;

    UI.count.innerText = `${state.currentIndex + 1} / ${total}`;
}

/* -------------------------
   INPUT
------------------------- */

function registerHotkeys() {
    window.addEventListener('keydown', (e) => {
        if (state.images.length === 0) return;

        switch (e.key) {
            case 'ArrowRight':
                if (state.currentIndex < state.images.length - 1)
                    state.currentIndex++;
                updateView();
                break;

            case 'ArrowLeft':
                if (state.currentIndex > 0)
                    state.currentIndex--;
                updateView();
                break;

            case ' ':
                e.preventDefault();
                state.view = state.view === 'ZOOM' ? 'CAROUSEL' : 'ZOOM';
                updateView();
                break;
        }
    });
}
