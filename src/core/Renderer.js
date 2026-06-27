/**
 * Renderer.js — Canvas 2D drawing utilities shared by all simulations.
 *
 * Road geometry convention (all sizes in pixels):
 *   geo = { laneH, stripeH, roadYTop, roadYBot }
 *
 * Ring-road coordinate convention:
 *   Top lane  [0, Nx)  — physical x = 0 → Lx  (left to right on screen)
 *   Bot lane  [Nx, 2Nx) — physical x = Lx → 0  (right to left on screen)
 *   In botValues the ring index k=0 is at x=Lx (right), k=Nx-1 is at x≈0 (left).
 *   drawHeatmap accounts for this automatically.
 */

// ─── Internal helpers ─────────────────────────────────────────────────────────

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

/** Draw a rounded rectangle path (does not stroke/fill). */
function roundRectPath(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

// ─── Road background ──────────────────────────────────────────────────────────

/**
 * Draw two-lane ring road background with dashed yellow centre stripe.
 * @param {CanvasRenderingContext2D} ctx
 * @param {HTMLCanvasElement} canvas
 * @param {string} title  - label shown in top-left
 * @param {{ laneH, stripeH, roadYTop, roadYBot }} geo
 * @param {string} [laneColor='#6f6d67']  - asphalt colour
 */
export function drawRoadBg(ctx, canvas, title, geo, laneColor = '#6f6d67') {
    const { laneH, stripeH, roadYTop, roadYBot } = geo;

    ctx.fillStyle = '#1f3a1d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = laneColor;
    ctx.fillRect(0, roadYTop - laneH / 2, canvas.width, laneH);
    _dashedStripe(ctx, roadYTop + laneH / 2, canvas.width, stripeH);
    ctx.fillStyle = laneColor;
    ctx.fillRect(0, roadYBot - laneH / 2, canvas.width, laneH);

    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, roadYTop - laneH / 2, canvas.width, laneH * 2 + stripeH);

    ctx.fillStyle = '#f0f0f0';
    ctx.font = '13px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(title, 14, 7);
}

function _dashedStripe(ctx, y, width, h) {
    const dash = h * 6, gap = h * 4;
    ctx.fillStyle = '#f0c000';
    for (let x = 0; x < width; x += dash + gap) {
        ctx.fillRect(x, y, Math.min(dash, width - x), h);
    }
}

// ─── Heatmap overlay ──────────────────────────────────────────────────────────

/**
 * Colour each spatial cell of both lanes with colorFn.
 * topValues[i] → top lane cell i (ring index i = physical x ≈ i*dx).
 * botValues[k] → bottom lane cell k (ring index Nx+k; k=0 is at x=Lx).
 */
export function drawHeatmap(ctx, topValues, botValues, colorFn, geo, pxPerM, lx) {
    const { laneH, roadYTop, roadYBot } = geo;
    const nx   = topValues.length;
    const cellW = lx * pxPerM / nx;
    const topY  = roadYTop - laneH / 2;
    const botY  = roadYBot - laneH / 2;

    for (let i = 0; i < nx; i++) {
        const xPx = i * cellW;
        ctx.fillStyle = colorFn(topValues[i]);
        ctx.fillRect(xPx, topY, Math.ceil(cellW), laneH);

        // bottom lane: k = nx-1-i maps ring index to screen x ≈ i*dx
        const k = nx - 1 - i;
        ctx.fillStyle = colorFn(botValues[k]);
        ctx.fillRect(xPx, botY, Math.ceil(cellW), laneH);
    }
}

// ─── Vector graphics car ───────────────────────────────────────────────────────────────

/**
 * Draw a top-down vector car centred at (cx, cy).
 * Includes body, windshield, and rear window — no raster sprite.
 * @param {boolean} facingRight - mirrors sprite if false
 * @param {string}  [color='#1a5fa8']
 */
export function drawCar(ctx, cx, cy, lengthPx, widthPx, facingRight, color = '#1a5fa8') {
    ctx.save();
    ctx.translate(cx, cy);
    if (!facingRight) ctx.scale(-1, 1);

    const L = lengthPx, W = widthPx;

    // Body
    ctx.fillStyle = color;
    roundRectPath(ctx, -L / 2, -W / 2, L, W, 3);
    ctx.fill();

    // Windshield (front, right side when facing right)
    ctx.fillStyle = 'rgba(175, 215, 245, 0.82)';
    roundRectPath(ctx, L * 0.14, -W * 0.38, L * 0.33, W * 0.76, 2);
    ctx.fill();

    // Rear window
    ctx.fillStyle = 'rgba(155, 195, 220, 0.62)';
    roundRectPath(ctx, -L * 0.46, -W * 0.38, L * 0.20, W * 0.76, 2);
    ctx.fill();

    ctx.restore();
}

// ─── Destination marker ───────────────────────────────────────────────────────

/** Draw a vertical red destination line on the road canvas. */
export function drawDestinationMarker(ctx, xPx, laneTopY, laneH) {
    ctx.strokeStyle = '#ff3a3a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(xPx, laneTopY);
    ctx.lineTo(xPx, laneTopY + laneH);
    ctx.stroke();
}

// ─── Gradient legend bar ──────────────────────────────────────────────────────

/**
 * Draw a horizontal gradient legend with title and end labels.
 * @param {Function} colorFn  - (value) → css color, sampled across [minVal, maxVal]
 */
export function drawLegend(ctx, x, y, w, h, title, minLabel, maxLabel, colorFn,
                            minVal = 0, maxVal = 1, steps = 80) {
    const grad = ctx.createLinearGradient(x, 0, x + w, 0);
    for (let i = 0; i <= steps; i++) {
        grad.addColorStop(i / steps, colorFn(minVal + (maxVal - minVal) * i / steps));
    }
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);

    ctx.fillStyle = '#d8d8d8';
    ctx.font = '12px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText(title, x, y - 3);
    ctx.textBaseline = 'top';
    ctx.fillText(minLabel, x, y + h + 3);
    ctx.textAlign = 'right';
    ctx.fillText(maxLabel, x + w, y + h + 3);
}

// ─── Line plot ────────────────────────────────────────────────────────────────

/**
 * Draw an annotated x–y line plot.
 * @param {Array<{label, color, values}>} datasets
 *   Each dataset's values[i] corresponds to physical x = i/(n-1) * xMax.
 */
export function drawLinePlot(ctx, canvas, title, yLabel, yMin, yMax, xMax, datasets) {
    ctx.fillStyle = '#161c1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const padL = 66, padR = 145, padT = 28, padB = 44;
    const pw  = canvas.width  - padL - padR;
    const ph  = canvas.height - padT - padB;
    const ax  = padL;
    const ab  = padT + ph;

    // Axes
    ctx.strokeStyle = '#c0c0c0';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(ax, padT);
    ctx.lineTo(ax, ab);
    ctx.lineTo(ax + pw, ab);
    ctx.stroke();

    // Title
    ctx.fillStyle = '#f0f0f0';
    ctx.font = '13px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(title, 12, 6);

    const toY = v => ab - ph * clamp((v - yMin) / Math.max(yMax - yMin, 1e-9), 0, 1);

    ctx.font = '11px "Segoe UI", Arial, sans-serif';
    ctx.strokeStyle = '#3a4a40';
    ctx.fillStyle = '#a8b5b0';
    ctx.lineWidth = 1;

    // X ticks & grid
    for (let k = 0; k <= 8; k++) {
        const f  = k / 8;
        const xp = ax + f * pw;
        ctx.beginPath(); ctx.moveTo(xp, ab); ctx.lineTo(xp, ab + 5); ctx.stroke();
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText((f * xMax).toFixed(0), xp, ab + 7);
    }
    // Y ticks
    for (let k = 0; k <= 5; k++) {
        const f  = k / 5;
        const yp = ab - f * ph;
        const val = yMin + f * (yMax - yMin);
        ctx.beginPath(); ctx.moveTo(ax - 5, yp); ctx.lineTo(ax, yp); ctx.stroke();
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        ctx.fillText(val.toFixed(2), ax - 8, yp);
    }

    // Axis labels
    ctx.fillStyle = '#d0d0d0';
    ctx.font = '12px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText('x (m)', ax + pw / 2, ab + 26);
    ctx.save();
    ctx.translate(16, padT + ph / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(yLabel, 0, 0);
    ctx.restore();

    // Data series
    for (const { label, color, values } of datasets) {
        const n = values.length;
        ctx.strokeStyle = color;
        ctx.lineWidth   = 2;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
            const xp = ax + (i / Math.max(n - 1, 1)) * pw;
            const yp = toY(values[i]);
            if (i === 0) ctx.moveTo(xp, yp); else ctx.lineTo(xp, yp);
        }
        ctx.stroke();
    }

    // Dataset legend (right of plot)
    datasets.forEach(({ label, color }, idx) => {
        const lx = ax + pw + 10;
        const ly = padT + idx * 18;
        ctx.fillStyle = color;
        ctx.fillRect(lx, ly + 4, 18, 3);
        ctx.fillStyle = '#d0d0d0';
        ctx.font = '11px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(label, lx + 24, ly);
    });
}
