// ===== Wheel Configuration and State =====
let config = null;
let currentCategory = null;
let choices = [];
let spinsRemaining = 0;
let totalSpins = 0;
let chosenResults = [];
let isSpinning = false;
let currentRotation = 0;

// Multi-category session state
let session = [];           // Array of {categoryKey, spins, title}
let sessionIndex = 0;       // Current position in session
let sessionResults = [];    // Results grouped by category: [{category, title, results: []}]

// Pending result (waiting for user to accept or re-spin)
let pendingResult = null;

// Image cache for SVG/image icons
const imageCache = new Map();

// DOM Elements
const canvas = document.getElementById('wheelCanvas');
const ctx = canvas.getContext('2d');
const spinBtn = document.getElementById('spinBtn');
const resetBtn = document.getElementById('resetBtn');
const spinsRemainingEl = document.getElementById('spinsRemaining');
const resultsList = document.getElementById('resultsList');
const celebrationOverlay = document.getElementById('celebrationOverlay');
const winnerCard = document.getElementById('winnerCard');
const winnerIcon = document.getElementById('winnerIcon');
const winnerTitle = document.getElementById('winnerTitle');
const winnerName = document.getElementById('winnerName');
const continueBtn = document.getElementById('continueBtn');
const spinAgainBtn = document.getElementById('spinAgainBtn');
const confettiContainer = document.getElementById('confettiContainer');
const finalOverlay = document.getElementById('finalOverlay');
const finalResults = document.getElementById('finalResults');
const playAgainBtn = document.getElementById('playAgainBtn');
const pageTitle = document.getElementById('pageTitle');
const subtitle = document.getElementById('subtitle');
const categorySelector = document.getElementById('categorySelector');
const categoryGrid = document.getElementById('categoryGrid');
const wheelStage = document.querySelector('.wheel-stage');
const wheelCenter = document.querySelector('.wheel-center');
const controls = document.querySelector('.controls');
const resultsPanel = document.getElementById('resultsPanel');

// ===== URL Parameter Handling =====
function getUrlParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        category: params.get('category'),
        spins: parseInt(params.get('spins')) || null,
        session: params.get('session'),  // Format: "category1:spins,category2:spins"
        customConfig: parseHashConfig()   // Custom wheel from wheel-builder
    };
}

function parseHashConfig() {
    const hash = window.location.hash;
    if (!hash.includes('config=')) return null;
    
    try {
        const base64 = hash.split('config=')[1];
        const jsonStr = decodeURIComponent(escape(atob(base64)));
        const config = JSON.parse(jsonStr);
        
        // Convert from wheel-builder format to wheel format
        return {
            title: config.t || 'Custom Wheel',
            choices: (config.i || []).map(item => ({
                name: item.n,
                color: item.c,
                icon: item.e,
                isPrize: item.p === 1
            }))
        };
    } catch (e) {
        console.error('Failed to parse custom config:', e);
        return null;
    }
}

function parseSession(sessionStr) {
    // Parse "appetizer:1,main:1,sides:3,dessert:1"
    const parts = sessionStr.split(',');
    const sessionItems = [];
    
    for (const part of parts) {
        const [categoryKey, spinsStr] = part.trim().split(':');
        const spins = parseInt(spinsStr) || 1;
        
        if (config.categories[categoryKey]) {
            sessionItems.push({
                categoryKey,
                spins,
                title: config.categories[categoryKey].title
            });
        }
    }
    
    return sessionItems;
}

function updateUrl(category, spins) {
    const url = new URL(window.location);
    url.searchParams.set('category', category);
    url.searchParams.set('spins', spins);
    window.history.pushState({}, '', url);
}

// ===== Initialize =====
async function init() {
    try {
        const response = await fetch('config.json');
        config = await response.json();
    } catch (error) {
        console.error('Failed to load config:', error);
        config = getDefaultConfig();
    }
    
    const params = getUrlParams();
    
    // Custom wheel from wheel-builder (highest priority)
    if (params.customConfig) {
        session = [];
        promptForSpinsCustom(params.customConfig);
        return;
    }
    
    if (params.session) {
        // Multi-category session mode
        session = parseSession(params.session);
        if (session.length > 0) {
            sessionIndex = 0;
            sessionResults = [];
            startSessionCategory();
            return;
        }
    }
    
    if (params.category && config.categories[params.category]) {
        // Single category mode
        session = [];
        const spins = params.spins || config.defaultSpins || 1;
        startCategory(params.category, spins);
    } else {
        // Show category selector
        showCategorySelector();
    }
}

function getDefaultConfig() {
    return {
        categories: {
            "sample": {
                title: "🎡 Sample Wheel",
                choices: [
                    { name: "Option 1", color: "#FF6B6B", icon: "🎁", isPrize: true },
                    { name: "Option 2", color: "#4ECDC4", icon: "🎉", isPrize: true },
                    { name: "Option 3", color: "#FFE66D", icon: "⭐", isPrize: true },
                    { name: "Try Again", color: "#A8A8A8", icon: "🔄", isPrize: false }
                ]
            }
        },
        defaultCategory: "sample",
        defaultSpins: 1
    };
}

// ===== Category Selector =====
function showCategorySelector() {
    categorySelector.classList.remove('hidden');
    wheelStage.classList.add('hidden');
    controls.classList.add('hidden');
    resultsPanel.classList.add('hidden');
    
    pageTitle.textContent = '🎡 Lucky Spin Wheel';
    subtitle.textContent = 'Pick a category to get started!';
    spinsRemainingEl.textContent = '-';
    
    // Build category cards
    categoryGrid.innerHTML = '';
    
    for (const [key, category] of Object.entries(config.categories)) {
        const card = document.createElement('div');
        card.className = 'category-card';
        card.innerHTML = `
            <div class="category-card-title">${category.title}</div>
            <div class="category-card-count">${category.choices.length} choices</div>
        `;
        card.addEventListener('click', () => promptForSpins(key, category));
        categoryGrid.appendChild(card);
    }
}

function promptForSpins(categoryKey, category) {
    // Create a simple modal for spin count
    const modal = document.createElement('div');
    modal.className = 'celebration-overlay active';
    modal.innerHTML = `
        <div class="winner-card" style="animation: card-pop 0.3s ease">
            <div class="winner-icon">${category.title.split(' ')[0]}</div>
            <h2 class="winner-title" style="font-size: 1.5rem; background: linear-gradient(135deg, var(--accent-gold) 0%, #fff5cc 100%); -webkit-background-clip: text; background-clip: text; color: transparent;">
                ${category.title}
            </h2>
            <div class="spins-input-container" style="flex-direction: column; gap: 0.75rem; margin: 1.5rem 0;">
                <label for="spinCount" style="color: #b8b8d1;">How many spins?</label>
                <input type="number" id="spinCount" class="spins-input" value="1" min="1" max="20">
            </div>
            <button class="continue-btn" id="startSpinBtn">Let's Spin! 🎰</button>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    const input = modal.querySelector('#spinCount');
    const startBtn = modal.querySelector('#startSpinBtn');
    
    input.focus();
    input.select();
    
    const start = () => {
        const spins = Math.max(1, Math.min(20, parseInt(input.value) || 1));
        modal.remove();
        document.removeEventListener('keydown', handleModalKeys);
        startCategory(categoryKey, spins);
    };
    
    const handleModalKeys = (e) => {
        if (e.code === 'Space' || e.code === 'Enter') {
            e.preventDefault();
            start();
        } else if (e.code === 'Escape') {
            modal.remove();
            document.removeEventListener('keydown', handleModalKeys);
        }
    };
    
    document.addEventListener('keydown', handleModalKeys);
    
    startBtn.addEventListener('click', start);
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
            document.removeEventListener('keydown', handleModalKeys);
        }
    });
}

// Prompt for spins with custom config (from wheel-builder)
function promptForSpinsCustom(customConfig) {
    // Get the icon from the title (first emoji) or use default
    const titleIcon = customConfig.title.match(/[\p{Emoji}]/u)?.[0] || '🎯';
    
    const modal = document.createElement('div');
    modal.className = 'celebration-overlay active';
    modal.innerHTML = `
        <div class="winner-card" style="animation: card-pop 0.3s ease">
            <div class="winner-icon">${titleIcon}</div>
            <h2 class="winner-title" style="font-size: 1.5rem; background: linear-gradient(135deg, var(--accent-gold) 0%, #fff5cc 100%); -webkit-background-clip: text; background-clip: text; color: transparent;">
                ${customConfig.title}
            </h2>
            <div class="spins-input-container" style="flex-direction: column; gap: 0.75rem; margin: 1.5rem 0;">
                <label for="spinCount" style="color: #b8b8d1;">How many spins?</label>
                <input type="number" id="spinCount" class="spins-input" value="1" min="1" max="20">
            </div>
            <button class="continue-btn" id="startSpinBtn">Let's Spin! 🎰</button>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    const input = modal.querySelector('#spinCount');
    const startBtn = modal.querySelector('#startSpinBtn');
    
    input.focus();
    input.select();
    
    const start = () => {
        const spins = Math.max(1, Math.min(20, parseInt(input.value) || 1));
        modal.remove();
        document.removeEventListener('keydown', handleModalKeys);
        startCustomWheel(customConfig, spins);
    };
    
    const handleModalKeys = (e) => {
        if (e.code === 'Space' || e.code === 'Enter') {
            e.preventDefault();
            start();
        } else if (e.code === 'Escape') {
            modal.remove();
            document.removeEventListener('keydown', handleModalKeys);
            showCategorySelector();
        }
    };
    
    document.addEventListener('keydown', handleModalKeys);
    
    startBtn.addEventListener('click', start);
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
            document.removeEventListener('keydown', handleModalKeys);
            showCategorySelector();
        }
    });
}

// Start a custom wheel (from wheel-builder)
async function startCustomWheel(customConfig, spins) {
    // Create a temporary category object
    currentCategory = {
        title: customConfig.title,
        choices: customConfig.choices
    };
    choices = customConfig.choices;
    totalSpins = spins;
    spinsRemaining = spins;
    chosenResults = [];
    currentRotation = 0;
    isSpinning = false;
    
    // Update UI
    pageTitle.textContent = customConfig.title;
    subtitle.textContent = `${choices.length} choices • ${spins} spin${spins > 1 ? 's' : ''}`;
    
    // Show wheel, hide selector
    categorySelector.classList.add('hidden');
    wheelStage.classList.remove('hidden');
    controls.classList.remove('hidden');
    resultsPanel.classList.remove('hidden');
    
    // Preload images, then draw and enable
    await preloadImages(choices);
    drawWheel();
    updateUI();
    spinBtn.disabled = false;
}

// ===== Start Category =====
async function startCategory(categoryKey, spins) {
    currentCategory = config.categories[categoryKey];
    choices = currentCategory.choices;
    totalSpins = spins;
    spinsRemaining = spins;
    chosenResults = [];
    currentRotation = 0;
    isSpinning = false;
    
    // Update URL (only for single category mode)
    if (session.length === 0) {
        updateUrl(categoryKey, spins);
    }
    
    // Update UI
    pageTitle.textContent = currentCategory.title;
    subtitle.textContent = `${choices.length} choices • ${spins} spin${spins > 1 ? 's' : ''}`;
    
    // Show wheel, hide selector
    categorySelector.classList.add('hidden');
    wheelStage.classList.remove('hidden');
    controls.classList.remove('hidden');
    resultsPanel.classList.remove('hidden');
    
    // Preload images, then draw and enable
    await preloadImages(choices);
    drawWheel();
    updateUI();
    spinBtn.disabled = false;
}

// ===== Session Mode Functions =====
async function startSessionCategory() {
    if (sessionIndex >= session.length) {
        showSessionFinalResults();
        return;
    }
    
    const current = session[sessionIndex];
    currentCategory = config.categories[current.categoryKey];
    choices = currentCategory.choices;
    totalSpins = current.spins;
    spinsRemaining = current.spins;
    chosenResults = [];
    currentRotation = 0;
    isSpinning = false;
    
    // Update UI with session progress
    const progress = `(${sessionIndex + 1}/${session.length})`;
    pageTitle.textContent = currentCategory.title;
    subtitle.textContent = `${progress} • ${choices.length} choices • ${current.spins} spin${current.spins > 1 ? 's' : ''}`;
    
    // Show wheel, hide selector
    categorySelector.classList.add('hidden');
    wheelStage.classList.remove('hidden');
    controls.classList.remove('hidden');
    resultsPanel.classList.remove('hidden');
    
    // Preload images, then draw and enable
    await preloadImages(choices);
    drawWheel();
    updateUI();
    spinBtn.disabled = false;
}

function advanceSession() {
    // Save results for this category
    sessionResults.push({
        category: session[sessionIndex].categoryKey,
        title: session[sessionIndex].title,
        results: [...chosenResults]
    });
    
    sessionIndex++;
    
    if (sessionIndex >= session.length) {
        showSessionFinalResults();
    } else {
        // Show transition screen
        showCategoryTransition();
    }
}

function showCategoryTransition() {
    const nextCategory = session[sessionIndex];
    
    const modal = document.createElement('div');
    modal.className = 'celebration-overlay active';
    modal.innerHTML = `
        <div class="winner-card" style="animation: card-pop 0.3s ease">
            <div class="winner-icon">🎯</div>
            <h2 class="winner-title" style="font-size: 1.3rem; background: linear-gradient(135deg, #4ECDC4 0%, #7FDBDA 100%); -webkit-background-clip: text; background-clip: text; color: transparent;">
                Next Up!
            </h2>
            <p class="winner-name" style="margin-bottom: 0.5rem;">${nextCategory.title}</p>
            <p style="color: #b8b8d1; font-size: 0.95rem; margin-bottom: 1.5rem;">
                ${nextCategory.spins} spin${nextCategory.spins > 1 ? 's' : ''} • Category ${sessionIndex + 1} of ${session.length}
            </p>
            <button class="continue-btn" id="nextCategoryBtn">Let's Go! 🎰</button>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    const nextBtn = modal.querySelector('#nextCategoryBtn');
    
    const proceed = () => {
        modal.remove();
        document.removeEventListener('keydown', handleTransitionKeys);
        startSessionCategory();
    };
    
    const handleTransitionKeys = (e) => {
        if (e.code === 'Space' || e.code === 'Enter') {
            e.preventDefault();
            proceed();
        }
    };
    
    document.addEventListener('keydown', handleTransitionKeys);
    nextBtn.addEventListener('click', proceed);
}

function showSessionFinalResults() {
    finalResults.innerHTML = '';
    
    // Group results by category
    sessionResults.forEach((group, groupIndex) => {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'session-group';
        groupDiv.style.cssText = `
            width: 100%;
            margin-bottom: 1.5rem;
            animation: stagger-in 0.4s ease backwards;
            animation-delay: ${groupIndex * 0.15}s;
        `;
        
        const groupTitle = document.createElement('div');
        groupTitle.style.cssText = `
            font-family: 'Fredoka', sans-serif;
            font-size: 1.1rem;
            color: #4ECDC4;
            margin-bottom: 0.5rem;
            text-align: center;
        `;
        groupTitle.textContent = group.title;
        groupDiv.appendChild(groupTitle);
        
        const itemsContainer = document.createElement('div');
        itemsContainer.style.cssText = `
            display: flex;
            flex-wrap: wrap;
            gap: 0.5rem;
            justify-content: center;
        `;
        
        group.results.forEach((result, index) => {
            const item = document.createElement('div');
            item.className = `final-result-item ${result.isPrize ? 'prize' : 'non-prize'}`;
            item.style.animationDelay = `${groupIndex * 0.15 + index * 0.05}s`;
            item.innerHTML = `
                <span class="result-icon">${result.icon}</span>
                <span>${result.name}</span>
            `;
            itemsContainer.appendChild(item);
        });
        
        groupDiv.appendChild(itemsContainer);
        finalResults.appendChild(groupDiv);
    });
    
    finalOverlay.classList.add('active');
    createFinalConfetti();
}

// ===== Image Preloading =====
function isImagePath(icon) {
    if (!icon) return false;
    const lower = icon.toLowerCase();
    return lower.endsWith('.svg') || lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.gif') || lower.endsWith('.webp');
}

function preloadImages(choicesList) {
    const promises = [];
    
    for (const choice of choicesList) {
        if (isImagePath(choice.icon) && !imageCache.has(choice.icon)) {
            const promise = new Promise((resolve) => {
                const img = new Image();
                img.onload = () => {
                    imageCache.set(choice.icon, img);
                    resolve();
                };
                img.onerror = () => {
                    console.warn(`Failed to load image: ${choice.icon}`);
                    resolve(); // Don't block on failed images
                };
                img.src = choice.icon;
            });
            promises.push(promise);
        }
    }
    
    return Promise.all(promises);
}

// ===== Draw Wheel =====
function drawWheel() {
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(centerX, centerY) - 10;
    const segmentAngle = (2 * Math.PI) / choices.length;
    const numChoices = choices.length;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Dynamic sizing based on number of slices
    // Icon is toward outer edge, text is centered closer to middle (with word wrap)
    let iconSize, textSize, iconDist, textDist, maxTextWidth;
    
    if (numChoices <= 3) {
        iconSize = 36;
        textSize = 22;
        iconDist = 0.78;
        textDist = 0.46;
        maxTextWidth = radius * 0.42;
    } else if (numChoices <= 4) {
        iconSize = 32;
        textSize = 20;
        iconDist = 0.78;
        textDist = 0.48;
        maxTextWidth = radius * 0.38;
    } else if (numChoices <= 5) {
        iconSize = 30;
        textSize = 18;
        iconDist = 0.79;
        textDist = 0.50;
        maxTextWidth = radius * 0.36;
    } else if (numChoices <= 6) {
        iconSize = 28;
        textSize = 16;
        iconDist = 0.80;
        textDist = 0.52;
        maxTextWidth = radius * 0.34;
    } else if (numChoices <= 8) {
        iconSize = 26;
        textSize = 14;
        iconDist = 0.81;
        textDist = 0.52;
        maxTextWidth = radius * 0.32;
    } else if (numChoices <= 10) {
        iconSize = 22;
        textSize = 13;
        iconDist = 0.82;
        textDist = 0.54;
        maxTextWidth = radius * 0.30;
    } else if (numChoices <= 12) {
        iconSize = 20;
        textSize = 12;
        iconDist = 0.84;
        textDist = 0.56;
        maxTextWidth = radius * 0.28;
    } else {
        iconSize = 18;
        textSize = 11;
        iconDist = 0.85;
        textDist = 0.58;
        maxTextWidth = radius * 0.26;
    }
    
    // Draw segments
    choices.forEach((choice, index) => {
        const startAngle = index * segmentAngle + currentRotation;
        const endAngle = startAngle + segmentAngle;
        
        // Draw segment
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, startAngle, endAngle);
        ctx.closePath();
        
        // Fill with gradient
        const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, radius);
        gradient.addColorStop(0, lightenColor(choice.color, 30));
        gradient.addColorStop(1, choice.color);
        ctx.fillStyle = gradient;
        ctx.fill();
        
        // Draw border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Draw text and icon
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(startAngle + segmentAngle / 2);
        
        // Draw icon (either emoji or image) - positioned toward outer edge
        const iconX = radius * iconDist;
        const iconY = 0;
        
        if (isImagePath(choice.icon) && imageCache.has(choice.icon)) {
            // Draw image
            const img = imageCache.get(choice.icon);
            const imgSize = iconSize * 1.2;
            ctx.drawImage(img, iconX - imgSize/2, iconY - imgSize/2, imgSize, imgSize);
        } else {
            // Draw emoji
            ctx.font = `${iconSize}px sans-serif`;
            ctx.fillStyle = 'white';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(choice.icon, iconX, iconY);
        }
        
        // Draw text - positioned toward center, with word wrap
        ctx.font = `bold ${textSize}px system-ui, sans-serif`;
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;
        
        // Word wrap the text
        const words = choice.name.split(' ');
        const lines = [];
        let currentLine = '';
        
        for (const word of words) {
            const testLine = currentLine ? `${currentLine} ${word}` : word;
            if (ctx.measureText(testLine).width > maxTextWidth && currentLine) {
                lines.push(currentLine);
                currentLine = word;
            } else {
                currentLine = testLine;
            }
        }
        if (currentLine) lines.push(currentLine);
        
        // Draw each line centered
        const lineHeight = textSize * 1.2;
        const totalTextHeight = lines.length * lineHeight;
        const textStartY = -totalTextHeight / 2 + lineHeight / 2;
        
        lines.forEach((line, i) => {
            ctx.fillText(line, radius * textDist, textStartY + i * lineHeight);
        });
        
        ctx.restore();
    });
    
    // Draw outer ring decoration
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.5)';
    ctx.lineWidth = 4;
    ctx.stroke();
    
    // Draw pegs around the edge (these rotate with the wheel)
    const pegCount = choices.length * 2; // 2 pegs per segment
    for (let i = 0; i < pegCount; i++) {
        const angle = (i / pegCount) * 2 * Math.PI + currentRotation;
        const x = centerX + Math.cos(angle) * (radius + 2);
        const y = centerY + Math.sin(angle) * (radius + 2);
        
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, 2 * Math.PI);
        ctx.fillStyle = i % 2 === 0 ? '#ffd700' : '#ffffff';
        ctx.fill();
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();
    }
}

function lightenColor(color, percent) {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt;
    const G = (num >> 8 & 0x00FF) + amt;
    const B = (num & 0x0000FF) + amt;
    return '#' + (
        0x1000000 +
        (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
        (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
        (B < 255 ? (B < 1 ? 0 : B) : 255)
    ).toString(16).slice(1);
}

// ===== Spin Logic =====
let lastPegIndex = -1; // Track which peg was last at the pointer

function spin() {
    if (isSpinning || spinsRemaining <= 0) return;
    
    isSpinning = true;
    spinBtn.disabled = true;
    document.querySelector('.wheel-frame').classList.add('spinning');
    lastPegIndex = -1;
    
    const TAU = 2 * Math.PI;
    
    // True random spin - just pick a random amount to rotate
    const extraRotations = 5 + Math.random() * 3;
    const randomAngle = Math.random() * TAU;
    const totalRotation = extraRotations * TAU + randomAngle;
    
    // Animate the spin
    const startTime = performance.now();
    const duration = 4000 + Math.random() * 1000;
    const startRotation = currentRotation;
    const pointerEl = document.querySelector('.wheel-pointer');
    const pegCount = choices.length * 2;
    const pointerAngle = 3 * Math.PI / 2; // for peg flicking only
    
    function animate(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Easing function (ease-out cubic)
        const easeOut = 1 - Math.pow(1 - progress, 3);
        
        currentRotation = startRotation + totalRotation * easeOut;
        drawWheel();
        
        // Check for peg passing pointer (for flick animation)
        const normalizedRotation = ((currentRotation % TAU) + TAU) % TAU;
        
        for (let i = 0; i < pegCount; i++) {
            let pegAngle = (i / pegCount) * TAU + normalizedRotation;
            pegAngle = ((pegAngle % TAU) + TAU) % TAU;
            
            const diff = Math.abs(pegAngle - pointerAngle);
            const distance = Math.min(diff, TAU - diff);
            
            if (distance < 0.1 && i !== lastPegIndex) {
                lastPegIndex = i;
                pointerEl.classList.remove('flick');
                void pointerEl.offsetWidth;
                pointerEl.classList.add('flick');
                break;
            }
        }
        
        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            // Spin complete
            document.querySelector('.wheel-frame').classList.remove('spinning');
            pointerEl.classList.remove('flick');
            
            // Normalize rotation to prevent floating point accumulation
            currentRotation = ((currentRotation % TAU) + TAU) % TAU;
            
            // Pause bounce animation for stable DOM measurement
            pointerEl.style.animation = 'none';
            // Force reflow so animation stops immediately
            void pointerEl.offsetHeight;
            
            const winningChoice = getWinningChoice();
            
            // Resume bounce animation
            pointerEl.style.animation = '';
            
            handleSpinComplete(winningChoice);
        }
    }
    
    requestAnimationFrame(animate);
}

function getPointerAngleFromDOM() {
  const c = canvas.getBoundingClientRect();
  const centerX = c.left + c.width / 2;
  const centerY = c.top + c.height / 2;

  const p = document.querySelector('.wheel-pointer').getBoundingClientRect();
  const tipX = p.left + p.width / 2;
  const tipY = p.bottom; // approx tip for â–¼

  let a = Math.atan2(tipY - centerY, tipX - centerX); // -Ï€..Ï€
  if (a < 0) a += 2 * Math.PI;                         // 0..2Ï€
  return a;
}

function getWinningChoice() {
  const seg = (2 * Math.PI) / choices.length;
  const pointer = getPointerAngleFromDOM(); // actual DOM position
  const rot = ((currentRotation % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

  // pointer angle expressed in the wheel's local coordinates
  let local = (pointer - rot + 2 * Math.PI) % (2 * Math.PI);

  // Nudge to make boundary cases deterministic (pick the slice you "just entered")
  local = (local - 1e-10 + 2 * Math.PI) % (2 * Math.PI);

  const idx = Math.floor(local / seg);
  return choices[idx];
}

function handleSpinComplete(choice) {
    // Store as pending - will be added to results when user confirms
    pendingResult = choice;
    
    // Show celebration (will check for duplicates)
    showCelebration(choice);
}

// ===== Celebration =====
function showCelebration(choice) {
    winnerIcon.textContent = choice.icon;
    winnerName.textContent = choice.name;
    
    // Check if this is a duplicate
    const isDuplicate = chosenResults.some(r => r.name === choice.name);
    
    if (isDuplicate) {
        spinAgainBtn.classList.add('visible');
    } else {
        spinAgainBtn.classList.remove('visible');
    }
    
    if (choice.isPrize) {
        winnerCard.classList.remove('non-prize');
        winnerTitle.textContent = isDuplicate ? '🔄 Duplicate!' : '🎉 WINNER! 🎉';
        if (!isDuplicate) createConfetti();
    } else {
        winnerCard.classList.add('non-prize');
        winnerTitle.textContent = isDuplicate ? '🔄 Duplicate!' : 'Oh no...';
    }
    
    celebrationOverlay.classList.add('active');
}

function createConfetti() {
    confettiContainer.innerHTML = '';
    const colors = ['#ff6b6b', '#4ecdc4', '#ffe66d', '#ff6b9d', '#00d4ff', '#ffd700', '#95e1d3'];
    
    for (let i = 0; i < 100; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        confetti.style.left = Math.random() * 100 + '%';
        confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.animationDelay = Math.random() * 0.5 + 's';
        confetti.style.animationDuration = (2 + Math.random() * 2) + 's';
        
        // Random shapes
        if (Math.random() > 0.5) {
            confetti.style.borderRadius = '50%';
        } else {
            confetti.style.width = '8px';
            confetti.style.height = '16px';
        }
        
        confettiContainer.appendChild(confetti);
    }
}

function hideCelebration() {
    celebrationOverlay.classList.remove('active');
    confettiContainer.innerHTML = '';
    
    // Confirm the pending result
    if (pendingResult) {
        chosenResults.push(pendingResult);
        spinsRemaining--;
        pendingResult = null;
    }
    
    updateUI();
    
    // Check if all spins for this category are complete
    if (spinsRemaining <= 0) {
        if (session.length > 0) {
            // Session mode - advance to next category
            setTimeout(advanceSession, 300);
        } else {
            // Single category mode - show final results
            setTimeout(showFinalResults, 300);
        }
    } else {
        isSpinning = false;
        spinBtn.disabled = false;
    }
}

function spinAgain() {
    // Discard the pending result and spin again
    pendingResult = null;
    celebrationOverlay.classList.remove('active');
    confettiContainer.innerHTML = '';
    
    isSpinning = false;
    spin();
}

// ===== Final Results =====
function showFinalResults() {
    finalResults.innerHTML = '';
    
    chosenResults.forEach((result, index) => {
        const item = document.createElement('div');
        item.className = `final-result-item ${result.isPrize ? 'prize' : 'non-prize'}`;
        item.style.animationDelay = `${index * 0.1}s`;
        item.innerHTML = `
            <span class="result-icon">${result.icon}</span>
            <span>${result.name}</span>
        `;
        finalResults.appendChild(item);
    });
    
    finalOverlay.classList.add('active');
    createFinalConfetti();
}

function createFinalConfetti() {
    const existingConfetti = finalOverlay.querySelector('.confetti-container');
    if (existingConfetti) {
        existingConfetti.remove();
    }
    
    const container = document.createElement('div');
    container.className = 'confetti-container';
    container.style.position = 'absolute';
    container.style.inset = '0';
    container.style.pointerEvents = 'none';
    container.style.overflow = 'hidden';
    container.style.zIndex = '-1';
    
    const colors = ['#ff6b6b', '#4ecdc4', '#ffe66d', '#ff6b9d', '#00d4ff', '#ffd700', '#95e1d3'];
    
    for (let i = 0; i < 80; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        confetti.style.left = Math.random() * 100 + '%';
        confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.animationDelay = Math.random() * 2 + 's';
        confetti.style.animationDuration = (3 + Math.random() * 2) + 's';
        confetti.style.animationIterationCount = 'infinite';
        
        if (Math.random() > 0.5) {
            confetti.style.borderRadius = '50%';
        } else {
            confetti.style.width = '8px';
            confetti.style.height = '16px';
        }
        
        container.appendChild(confetti);
    }
    
    finalOverlay.querySelector('.final-content').style.position = 'relative';
    finalOverlay.querySelector('.final-content').appendChild(container);
}

function hideFinalResults() {
    finalOverlay.classList.remove('active');
    // Reset session state
    session = [];
    sessionIndex = 0;
    sessionResults = [];
    pendingResult = null;
    
    // Check if this was a custom wheel
    const customConfig = parseHashConfig();
    if (customConfig) {
        // Reload the custom wheel prompt
        promptForSpinsCustom(customConfig);
    } else {
        // Go back to category selector
        showCategorySelector();
        // Clear URL params
        window.history.pushState({}, '', window.location.pathname);
    }
}

// ===== UI Updates =====
function updateUI() {
    spinsRemainingEl.textContent = spinsRemaining;
    
    // Update results list
    resultsList.innerHTML = '';
    chosenResults.forEach(result => {
        const item = document.createElement('div');
        item.className = `result-item ${result.isPrize ? 'prize' : 'non-prize'}`;
        item.innerHTML = `
            <span class="result-icon">${result.icon}</span>
            <span>${result.name}</span>
        `;
        resultsList.appendChild(item);
    });
}

function resetGame() {
    pendingResult = null;
    if (session.length > 0) {
        // Reset entire session
        sessionIndex = 0;
        sessionResults = [];
        startSessionCategory();
    } else if (currentCategory) {
        // Reset current category
        spinsRemaining = totalSpins;
        chosenResults = [];
        currentRotation = 0;
        isSpinning = false;
        drawWheel();
        updateUI();
        spinBtn.disabled = false;
    } else {
        showCategorySelector();
    }
}

// ===== Event Listeners =====
spinBtn.addEventListener('click', spin);
resetBtn.addEventListener('click', resetGame);
continueBtn.addEventListener('click', hideCelebration);
spinAgainBtn.addEventListener('click', spinAgain);
playAgainBtn.addEventListener('click', hideFinalResults);
wheelCenter.addEventListener('click', spin);

// Allow clicking outside winner card to continue
celebrationOverlay.addEventListener('click', (e) => {
    if (e.target === celebrationOverlay || e.target.closest('.celebration-content') === e.target) {
        hideCelebration();
    }
});

// Keyboard support
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        e.preventDefault();
        if (celebrationOverlay.classList.contains('active')) {
            hideCelebration();
        } else if (finalOverlay.classList.contains('active')) {
            hideFinalResults();
        } else if (!isSpinning && spinsRemaining > 0 && currentCategory) {
            spin();
        }
    }
    if (e.code === 'KeyR' && celebrationOverlay.classList.contains('active') && spinAgainBtn.classList.contains('visible')) {
        e.preventDefault();
        spinAgain();
    }
    if (e.code === 'Enter' || e.code === 'Escape') {
        if (celebrationOverlay.classList.contains('active')) {
            hideCelebration();
        } else if (finalOverlay.classList.contains('active')) {
            hideFinalResults();
        }
    }
});

// Handle back button
window.addEventListener('popstate', () => {
    const params = getUrlParams();
    if (params.customConfig) {
        promptForSpinsCustom(params.customConfig);
    } else if (params.category && config && config.categories[params.category]) {
        const spins = params.spins || config.defaultSpins || 1;
        startCategory(params.category, spins);
    } else {
        showCategorySelector();
    }
});

// ===== Start =====
init();
