const state = {
    images: [],
    clusters: [],
    currentIndex: 0,
    flags: { KEEP: new Set(), REJECT: new Set() },
    ratings: {}, // filename -> 1-5
    view: 'GRID' // GRID, ZOOM, COMPARE
};

const UI = {
    startup: document.getElementById('startup'),
    workspace: document.getElementById('workspace'),
    hud: document.getElementById('hud'),
    grid: document.getElementById('grid-view'),
    zoom: document.getElementById('zoom-view'),
    compare: document.getElementById('compare-view'),
    compareLeft: document.getElementById('compare-left'),
    compareRight: document.getElementById('compare-right'),
    count: document.getElementById('stat-count'),
    keep: document.getElementById('stat-keep'),
    reject: document.getElementById('stat-reject'),
    burst: document.getElementById('stat-burst'),
    flag: document.getElementById('current-flag'),
    rating: document.getElementById('current-rating')
};

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
    
    // Sort by time taken (using lastModified as proxy)
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
        if (i === 0) {
            currentCluster.push(img);
            return;
        }
        
        const delta = img.timestamp - state.images[i-1].timestamp;
        if (delta < 1500) { // 1.5 seconds
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
    
    renderGrid();
    updateView();
    registerHotkeys();
}

function renderGrid() {
    UI.grid.innerHTML = '';
    state.images.forEach((img, i) => {
        const div = document.createElement('div');
        div.className = `thumbnail-container`;
        div.id = `thumb-${i}`;
        const el = document.createElement('img');
        el.src = img.url;
        el.loading = "lazy";
        div.appendChild(el);
        UI.grid.appendChild(div);
    });
}

function updateView() {
    if(state.images.length === 0) return;
    const img = state.images[state.currentIndex];
    
    // Toggle visibilities
    UI.grid.classList.toggle('hidden', state.view !== 'GRID');
    UI.zoom.classList.toggle('hidden', state.view !== 'ZOOM');
    UI.compare.classList.toggle('hidden', state.view !== 'COMPARE');

    if (state.view === 'ZOOM') {
        UI.zoom.style.backgroundImage = `url('${img.url}')`;
    } else if (state.view === 'COMPARE') {
        const burst = getActiveBurst();
        UI.compareLeft.style.backgroundImage = `url('${img.url}')`;
        // Compare with next image in burst, or previous if at end of burst
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

    // Rating
    const rate = state.ratings[img.name] || 0;
    UI.rating.innerText = '★'.repeat(rate) + '☆'.repeat(5-rate);

    // Burst info
    const burst = getActiveBurst();
    if (burst && burst.length > 1) {
        const pos = burst.findIndex(b => b.index === img.index) + 1;
        UI.burst.innerText = `Burst: ${pos}/${burst.length}`;
    } else {
        UI.burst.innerText = "Burst: None";
    }
    
    // Grid Visuals
    document.querySelectorAll('.thumbnail-container').forEach(el => el.classList.remove('active'));
    const activeEl = document.getElementById(`thumb-${state.currentIndex}`);
    if(activeEl && state.view === 'GRID') {
        activeEl.classList.add('active');
        activeEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }
}

// --- ENGINE LOGIC ---
function markImage(type) {
    const img = state.images[state.currentIndex];
    const el = document.getElementById(`thumb-${state.currentIndex}`);
    
    if (type === 'KEEP') {
        state.flags.KEEP.add(img.name);
        state.flags.REJECT.delete(img.name);
        el.className = 'thumbnail-container active flag-keep';
    } else if (type === 'REJECT') {
        state.flags.REJECT.add(img.name);
        state.flags.KEEP.delete(img.name);
        el.className = 'thumbnail-container active flag-reject';
    }
    
    if (state.currentIndex < state.images.length - 1) state.currentIndex++;
    updateView();
}

async function deleteCurrentImage() {
    const img = state.images[state.currentIndex];
    try {
        await img.handle.remove(); // Native OS delete
        state.images.splice(state.currentIndex, 1);
        URL.revokeObjectURL(img.url); // Free memory
        document.getElementById(`thumb-${img.index}`).remove();
        
        if (state.currentIndex >= state.images.length) state.currentIndex--;
        groupBursts(); // Rebuild clusters
        updateView();
    } catch (e) {
        console.warn("Delete blocked or failed. Check permissions.", e);
        alert("Permission needed to delete files. Try re-selecting folder with write access.");
    }
}

function registerHotkeys() {
    window.addEventListener('keydown', (e) => {
        if (state.images.length === 0) return;

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
            case ' ': // Space = Zoom
                e.preventDefault();
                state.view = state.view === 'ZOOM' ? 'GRID' : 'ZOOM';
                updateView();
                break;
            case 'TAB':
                e.preventDefault();
                state.view = state.view === 'COMPARE' ? 'GRID' : 'COMPARE';
                updateView();
                break;
            case 'G':
                state.view = 'GRID';
                updateView();
                break;
            case '1': case '2': case '3': case '4': case '5':
                state.ratings[state.images[state.currentIndex].name] = parseInt(e.key);
                updateHUD();
                break;
        }
    });
}const state = {
    images: [],
    currentIndex: 0,
    flags: { KEEP: new Set(), REJECT: new Set() }
};

const UI = {
    startup: document.getElementById('startup'),
    workspace: document.getElementById('workspace'),
    hud: document.getElementById('hud'),
    grid: document.getElementById('grid-view'),
    count: document.getElementById('stat-count'),
    keep: document.getElementById('stat-keep'),
    reject: document.getElementById('stat-reject'),
    flag: document.getElementById('current-flag')
};

// --- FILE SYSTEM LAYER ---
document.getElementById('btn-open').addEventListener('click', async () => {
    try {
        const dirHandle = await window.showDirectoryPicker();
        await scanImages(dirHandle);
        bootEngine();
    } catch (err) {
        console.log("User cancelled or error:", err);
    }
});

async function scanImages(dirHandle) {
    state.images = [];
    for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file' && entry.name.match(/\.(jpg|jpeg|png|webp)$/i)) {
            const file = await entry.getFile();
            state.images.push({
                handle: entry,
                name: entry.name,
                file: file,
                url: URL.createObjectURL(file) // Fast local browser cache
            });
        }
    }
    // Basic sort by name (MVP for timestamp sort)
    state.images.sort((a, b) => a.name.localeCompare(b.name));
}

// --- VIEW & RENDER ---
function bootEngine() {
    UI.startup.classList.add('hidden');
    UI.workspace.classList.remove('hidden');
    UI.hud.classList.remove('hidden');
    
    renderGrid();
    updateHUD();
    registerHotkeys();
}

function renderGrid() {
    UI.grid.innerHTML = '';
    state.images.forEach((img, index) => {
        const div = document.createElement('div');
        div.className = `thumbnail-container ${index === state.currentIndex ? 'active' : ''}`;
        div.id = `thumb-${index}`;
        
        const el = document.createElement('img');
        el.src = img.url;
        el.loading = "lazy"; // Lazy load illusion
        
        div.appendChild(el);
        UI.grid.appendChild(div);
    });
}

function updateHUD() {
    const total = state.images.length;
    if(total === 0) return;

    UI.count.innerText = `${state.currentIndex + 1} / ${total}`;
    
    const keeps = state.flags.KEEP.size;
    const rejects = state.flags.REJECT.size;
    
    UI.keep.innerText = `${Math.round((keeps/total)*100)}% Keep`;
    UI.reject.innerText = `${Math.round((rejects/total)*100)}% Reject`;

    const currentImg = state.images[state.currentIndex];
    if (state.flags.KEEP.has(currentImg.name)) UI.flag.innerText = "✔ KEEP";
    else if (state.flags.REJECT.has(currentImg.name)) UI.flag.innerText = "✖ REJECT";
    else UI.flag.innerText = "None";
    
    // Update visuals
    document.querySelectorAll('.thumbnail-container').forEach(el => el.classList.remove('active'));
    const activeEl = document.getElementById(`thumb-${state.currentIndex}`);
    if(activeEl) {
        activeEl.classList.add('active');
        activeEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }
}

// --- CULLING ENGINE & INPUT ---
function markImage(type) {
    const img = state.images[state.currentIndex];
    const el = document.getElementById(`thumb-${state.currentIndex}`);
    
    if (type === 'KEEP') {
        state.flags.KEEP.add(img.name);
        state.flags.REJECT.delete(img.name);
        el.classList.add('flag-keep');
        el.classList.remove('flag-reject');
    } else if (type === 'REJECT') {
        state.flags.REJECT.add(img.name);
        state.flags.KEEP.delete(img.name);
        el.classList.add('flag-reject');
        el.classList.remove('flag-keep');
    }
    
    // Auto-advance logic
    if (state.currentIndex < state.images.length - 1) {
        state.currentIndex++;
    }
    updateHUD();
}

function registerHotkeys() {
    window.addEventListener('keydown', (e) => {
        if (state.images.length === 0) return;

        switch(e.key.toUpperCase()) {
            case 'ARROWLEFT':
                if (state.currentIndex > 0) state.currentIndex--;
                updateHUD();
                break;
            case 'ARROWRIGHT':
                if (state.currentIndex < state.images.length - 1) state.currentIndex++;
                updateHUD();
                break;
            case 'C':
                markImage('KEEP');
                break;
            case 'X':
                markImage('REJECT');
                break;
        }
    });
}
