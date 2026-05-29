const VERSION = "v1.7";

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
    keep: document.getElementById('stat-keep'),
    reject: document.getElementById('stat-reject'),
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

// --- MODAL & SETTINGS LOGIC ---
function toggleHelp() {
    state.helpOpen = !state.helpOpen;
    UI.helpModal.classList.toggle('hidden', !state.helpOpen);
}
UI.helpBtn.addEventListener('click', toggleHelp);
UI.closeHelp.addEventListener('click', toggleHelp);

UI.arSelect.addEventListener('change', (e) => {
    document.documentElement.style.setProperty('--box-ar', e.target.value);
    UI.arSelect.blur(); 
});

// --- FILE SYSTEM LAYER ---
document.getElementById('btn-open').addEventListener('click', async () => {
    try {
        const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        await scanImages(dirHandle);
        bootEngine();
    } catch (err) {
        console.log("Error or cancelled:", err);
    }
});

async function scanImages(dirHandle) {
    let rawImages = [];
    for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file' && entry.name.match(/\.(jpg|jpeg|png|webp)$/i)) {
            const file = await entry.getFile();
            rawImages.push({
                handle: entry,
                name: entry.name,
                timestamp: file.lastModified,
                url: URL.createObjectURL(file) 
            });
        }
    }
    rawImages.sort((a, b) => a.timestamp - b.timestamp);
    state.images = rawImages;
    groupBursts();
}

// --- BURST ENGINE ---
function groupBursts() {
    state.clusters = [];
    let currentCluster = [];
    
    state.images.forEach((img, i) => {
        img.index = i;
        if (i === 0) { currentCluster.push(img); return; }
        
        const delta = img.timestamp - state.images[i-1].timestamp;
        if (delta < 1500) {
            currentCluster.push(img);
        } else {
            if(currentCluster.length > 0) state.clusters.push(currentCluster);
            currentCluster = [img];
        }
    });
    if(currentCluster.length > 0) state.clusters.push(currentCluster);
}

function getActiveBurst() {
    return state.clusters.find(cluster => cluster.some(img => img.index === state.currentIndex));
}

// --- VIEW CONTROLLER ---
function bootEngine() {
    UI.startup.classList.add('hidden');
    UI.workspace.classList.remove('hidden');
    UI.hud.classList.remove('hidden');
    
    updateView();
    registerHotkeys();
}

function renderCarousel() {
    if(state.images.length === 0) return;

    const nodes = [
        document.getElementById('c-node-0'),
        document.getElementById('c-node-1'),
        document.getElementById('c-node-2'),
        document.getElementById('c-node-3'),
        document.getElementById('c-node-4')
    ];

    nodes.forEach(node => node.className = 'carousel-slot');

    for (let i = -2; i <= 2; i++) {
        const targetIndex = state.currentIndex + i;
        const domIndex = ((targetIndex % 5) + 5) % 5;
        const node = nodes[domIndex];

        let posClass = 'pos-0';
        if (i === -2) posClass = 'pos-n2';
        if (i === -1) posClass = 'pos-n1';
        if (i === 1) posClass = 'pos-p1';
        if (i === 2) posClass = 'pos-p2';

        const prevClass = node.dataset.lastPos;
        if ((prevClass === 'pos-p2' && posClass === 'pos-n2') ||
            (prevClass === 'pos-n2' && posClass === 'pos-p2')) {
            node.style.transition = 'none'; 
            void node.offsetWidth;          
        } else {
            node.style.transition = '';     
        }

        node.dataset.lastPos = posClass;
        node.classList.add(posClass);

        if (targetIndex >= 0 && targetIndex < state.images.length) {
            const imgData = state.images[targetIndex];
            
            let imgEl = node.querySelector('img');
            if (!imgEl) {
                imgEl = document.createElement('img');
                node.appendChild(imgEl);
            }
            imgEl.src = imgData.url;

            if (state.flags.KEEP.has(imgData.name)) node.classList.add('flag-keep');
            if (state.flags.REJECT.has(imgData.name)) node.classList.add('flag-reject');
        } else {
            node.classList.add('empty-slot');
        }
    }
}

function updateView() {
    if(state.images.length === 0) return;
    const img = state.images[state.currentIndex];
    
    UI.carousel.classList.toggle('hidden', state.view !== 'CAROUSEL');
    UI.zoom.classList.toggle('hidden', state.view !== 'ZOOM');
    UI.compare.classList.toggle('hidden', state.view !== 'COMPARE');

    if (state.view === 'CAROUSEL') {
        renderCarousel();
    } else if (state.view === 'ZOOM') {
        UI.zoom.style.backgroundImage = `url('${img.url}')`;
    } else if (state.view === 'COMPARE') {
        const burst = getActiveBurst();
        UI.compareLeft.style.backgroundImage = `url('${img.url}')`;
        let compareImg = img;
        if (burst && burst.length > 1) {
            const nextIdx = burst.findIndex(b => b.index === img.index) + 1;
            compareImg = burst[nextIdx] ? burst[nextIdx] : burst[nextIdx - 2];
        }
        UI.compareRight.style.backgroundImage = `url('${compareImg.url}')`;
    }

    updateHUD();
}

function updateHUD() {
    const total = state.images.length;
    const img = state.images[state.currentIndex];
    UI.count.innerText = `${state.currentIndex + 1} / ${total}`;
    
    UI.keep.innerText = `${Math.round((state.flags.KEEP.size/total)*100)}% Keep`;
    UI.reject.innerText = `${Math.round((state.flags.REJECT.size/total)*100)}% Reject`;

    if (state.flags.KEEP.has(img.name)) UI.flag.innerText = "✔ KEEP";
    else if (state.flags.REJECT.has(img.name)) UI.flag.innerText = "✖ REJECT";
    else UI.flag.innerText = "None";

    const rate = state.ratings[img.name] || 0;
    UI.rating.innerText = '★'.repeat(rate) + '☆'.repeat(5-rate);

    const burst = getActiveBurst();
    if (burst && burst.length > 1) {
        const pos = burst.findIndex(b => b.index === img.index) + 1;
        UI.burst.innerText = `Burst: ${pos}/${burst.length}`;
    } else {
        UI.burst.innerText = "Burst: None";
    }
}

// --- ENGINE LOGIC ---
function markImage(type) {
    const img = state.images[state.currentIndex];
    
    if (type === 'KEEP') {
        state.flags.KEEP.add(img.name);
        state.flags.REJECT.delete(img.name);
    } else if (type === 'REJECT') {
        state.flags.REJECT.add(img.name);
        state.flags.KEEP.delete(img.name);
    }
    
    if (state.currentIndex < state.images.length - 1) state.currentIndex++;
    updateView();
}

async function deleteCurrentImage() {
    const img = state.images[state.currentIndex];
    try {
        await img.handle.remove();
        state.images.splice(state.currentIndex, 1);
        URL.revokeObjectURL(img.url);
        
        if (state.currentIndex >= state.images.length) state.currentIndex--;
        groupBursts();
        updateView();
    } catch (e) {
        console.warn("Delete failed.", e);
        alert("Permission needed to delete files.");
    }
}

function registerHotkeys() {
    window.addEventListener('keydown', (e) => {
        if (e.key === '?') {
            toggleHelp();
            return;
        }

        if (state.helpOpen || state.images.length === 0) return;
        if (document.activeElement === UI.arSelect) return;

        switch(e.key.toUpperCase()) {
            case 'ARROWLEFT':
                if (state.currentIndex > 0) state.currentIndex--;
                updateView();
                break;
            case 'ARROWRIGHT':
                if (state.currentIndex < state.images.length - 1) state.currentIndex++;
                updateView();
                break;
            case 'C': markImage('KEEP'); break;
            case 'X': markImage('REJECT'); break;
            case 'D': deleteCurrentImage(); break;
            case ' ': 
                e.preventDefault();
                state.view = state.view === 'ZOOM' ? 'CAROUSEL' : 'ZOOM';
                updateView();
                break;
            case 'TAB':
                e.preventDefault();
                state.view = state.view === 'COMPARE' ? 'CAROUSEL' : 'COMPARE';
                updateView();
                break;
            case 'G':
                state.view = 'CAROUSEL';
                updateView();
                break;
            case '1': case '2': case '3': case '4': case '5':
                state.ratings[state.images[state.currentIndex].name] = parseInt(e.key);
                updateHUD();
                break;
        }
    });
}
