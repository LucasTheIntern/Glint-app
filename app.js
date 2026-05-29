const state = {
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