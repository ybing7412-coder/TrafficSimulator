/**
 * Renderer.js — Canvas 2D drawing utilities shared by all simulations.
 *
 * Road geometry is described by a geo object built with makeGeo().
 * Road types: 'ring' (top + stripe + bottom) | 'straight' (top only).
 * numLanes: 1..4 independent parallel lanes, stacked vertically.
 */

export const PX_PER_M = 5;    // governs canvas WIDTH (road length axis)
export const LANE_H   = 60;   // visual lane height px
export const STRIPE_H = 8;    // centre stripe px  (ring road only)
export const CAR_L_PX = 40;   // car length along road px
export const CAR_W_PX = 20;   // car width across lane px

// ─── Geometry builder ─────────────────────────────────────────────────────────

/**
 * Build a geometry descriptor for the road canvas.
 * @param {number} numLanes   1–4 independent lanes
 * @param {'ring'|'straight'} roadType
 * @returns geo object used by drawRoadBg / drawHeatmap / callers of drawCar
 *
 * Ring layout (N lanes):
 *   [top lane 0 →]  …outer
 *   [top lane N-1 →] …inner (nearest stripe)
 *   [====== stripe ======]
 *   [bot lane N-1 ←] …inner (nearest stripe)
 *   [bot lane 0 ←]  …outer
 *
 * Straight layout (N lanes):
 *   [lane 0 →]
 *   …
 *   [lane N-1 →]
 */
export function makeGeo(numLanes = 1, roadType = 'ring') {
    const marginTop = 40;
    const marginBot = 80;

    const topLaneY = Array.from({ length: numLanes }, (_, l) =>
        marginTop + l * LANE_H + LANE_H / 2);

    if (roadType === 'ring') {
        const stripeY  = marginTop + numLanes * LANE_H;
        // bot lane l=0 (outer) is deepest; l=numLanes-1 (inner) is nearest stripe
        const botLaneY = Array.from({ length: numLanes }, (_, l) =>
            stripeY + STRIPE_H + (numLanes - 1 - l) * LANE_H + LANE_H / 2);
        const canvasH  = stripeY + STRIPE_H + numLanes * LANE_H + marginBot;
        return {
            numLanes, roadType, topLaneY, botLaneY, stripeY, canvasH,
            legendY: stripeY + STRIPE_H + numLanes * LANE_H + 18,
        };
    } else {
        const canvasH = marginTop + numLanes * LANE_H + marginBot;
        return {
            numLanes, roadType, topLaneY, botLaneY: null, stripeY: null, canvasH,
            legendY: marginTop + numLanes * LANE_H + 18,
        };
    }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

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

function _laneDivider(ctx, y, width) {
    const h = 2, dash = 20, gap = 14;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (let x = 0; x < width; x += dash + gap) {
        ctx.fillRect(x, y - 1, Math.min(dash, width - x), h);
    }
}

// ─── Road background ──────────────────────────────────────────────────────────

/**
 * Draw road background.
 * geo must be produced by makeGeo().
 */
export function drawRoadBg(ctx, canvas, title, geo, laneColor = '#6f6d67') {
    const { numLanes, roadType, topLaneY, botLaneY, stripeY } = geo;

    ctx.fillStyle = '#1f3a1d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let l = 0; l < numLanes; l++) {
        ctx.fillStyle = laneColor;
        ctx.fillRect(0, topLaneY[l] - LANE_H / 2, canvas.width, LANE_H);
    }

    if (roadType === 'ring') {
        // dividers between top lanes
        for (let l = 0; l < numLanes - 1; l++)
            _laneDivider(ctx, topLaneY[l] + LANE_H / 2, canvas.width);
        ctx.fillStyle = laneColor;
        ctx.fillRect(0, stripeY, canvas.width, STRIPE_H);
        _laneDivider(ctx, stripeY + STRIPE_H / 2, canvas.width);
        for (let l = 0; l < numLanes; l++) {
            ctx.fillStyle = laneColor;
            ctx.fillRect(0, botLaneY[l] - LANE_H / 2, canvas.width, LANE_H);
        }
        // dividers between bottom lanes
        for (let l = 0; l < numLanes - 1; l++)
            _laneDivider(ctx, botLaneY[l] + LANE_H / 2, canvas.width);
        const roadTop = topLaneY[0] - LANE_H / 2;
        const roadBot = Math.max(...botLaneY) + LANE_H / 2;
        ctx.strokeStyle = '#111'; ctx.lineWidth = 2;
        ctx.strokeRect(0, roadTop, canvas.width, roadBot - roadTop);
    } else {
        // dividers between straight lanes
        for (let l = 0; l < numLanes - 1; l++)
            _laneDivider(ctx, topLaneY[l] + LANE_H / 2, canvas.width);
        const roadTop = topLaneY[0] - LANE_H / 2;
        const roadBot = topLaneY[numLanes - 1] + LANE_H / 2;
        ctx.strokeStyle = '#111'; ctx.lineWidth = 2;
        ctx.strokeRect(0, roadTop, canvas.width, roadBot - roadTop);
    }

    ctx.fillStyle = '#f0f0f0';
    ctx.font = '13px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(title, 14, 7);
}

// ─── Heatmap overlay ──────────────────────────────────────────────────────────

/**
 * Colour each spatial cell of all lanes.
 * topLanes: Float32Array[]  — one per lane; [0..numLanes-1]
 * botLanes: Float32Array[] | null — ring only; same indexing
 *   botLanes[l][k] → bottom lane l, ring cell k (k=0 at x=Lx/right edge)
 *   drawHeatmap accounts for the right-to-left reversal internally.
 *
 * If topLanes has fewer entries than numLanes, the last entry is reused
 * (allows one simulation result to fill N display lanes).
 */
export function drawHeatmap(ctx, topLanes, botLanes, colorFn, geo, pxPerM, lx) {
    const { numLanes, roadType, topLaneY, botLaneY } = geo;
    const nx    = topLanes[0].length;
    const cellW = lx * pxPerM / nx;
    const fw    = Math.ceil(cellW) + 1; // +1 prevents hairline gaps between cells

    function gradFill(c0, c1, x0) {
        if (c0 === c1) { ctx.fillStyle = c0; return; }
        const g = ctx.createLinearGradient(x0, 0, x0 + cellW, 0);
        g.addColorStop(0, c0);
        g.addColorStop(1, c1);
        ctx.fillStyle = g;
    }

    for (let l = 0; l < numLanes; l++) {
        const tl   = topLanes[Math.min(l, topLanes.length - 1)];
        const topY = topLaneY[l] - LANE_H / 2;
        for (let i = 0; i < nx; i++) {
            const x0 = i * cellW;
            gradFill(colorFn(tl[i]), colorFn(tl[Math.min(i + 1, nx - 1)]), x0);
            ctx.fillRect(x0, topY, fw, LANE_H);
        }

        if (roadType === 'ring' && botLanes) {
            const bl   = botLanes[Math.min(l, botLanes.length - 1)];
            const botY = botLaneY[l] - LANE_H / 2;
            for (let i = 0; i < nx; i++) {
                const x0 = i * cellW;
                // bottom strip is drawn right→left, so next screen cell = index one lower
                gradFill(colorFn(bl[nx - 1 - i]), colorFn(bl[Math.max(nx - 2 - i, 0)]), x0);
                ctx.fillRect(x0, botY, fw, LANE_H);
            }
        }
    }
}

// ─── Vector graphics car ──────────────────────────────────────────────────────

/**
 * Draw a top-down vector car centred at (cx, cy).
 * @param {boolean} facingRight - mirrors sprite if false
 */
export function drawCar(ctx, cx, cy, lengthPx, widthPx, facingRight, color = '#1a5fa8') {
    ctx.save();
    ctx.translate(cx, cy);
    if (!facingRight) ctx.scale(-1, 1);

    const L = lengthPx, W = widthPx;

    ctx.fillStyle = color;
    roundRectPath(ctx, -L / 2, -W / 2, L, W, 3);
    ctx.fill();

    ctx.fillStyle = 'rgba(175, 215, 245, 0.82)';
    roundRectPath(ctx, L * 0.14, -W * 0.38, L * 0.33, W * 0.76, 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(155, 195, 220, 0.62)';
    roundRectPath(ctx, -L * 0.46, -W * 0.38, L * 0.20, W * 0.76, 2);
    ctx.fill();

    ctx.restore();
}

// ─── Destination marker ───────────────────────────────────────────────────────

export function drawDestinationMarker(ctx, xPx, laneTopY, laneH) {
    ctx.strokeStyle = '#ff3a3a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(xPx, laneTopY);
    ctx.lineTo(xPx, laneTopY + laneH);
    ctx.stroke();
}

// ─── Lane labels ─────────────────────────────────────────────────────────────

/**
 * Draw "Lane N" text at the left edge of each lane (straight road only, N > 1).
 */
export function drawLaneLabels(ctx, geo) {
    const { numLanes, roadType, topLaneY } = geo;
    if (roadType !== 'straight' || numLanes < 2) return;
    ctx.save();
    ctx.font = 'bold 11px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (let l = 0; l < numLanes; l++) {
        ctx.fillText(`Lane ${l + 1}`, 8, topLaneY[l]);
    }
    ctx.restore();
}

// ─── Gradient legend bar ──────────────────────────────────────────────────────

export function drawLegend(ctx, x, y, w, h, title, minLabel, maxLabel, colorFn,
                            minVal = 0, maxVal = 1, steps = 80) {
    const grad = ctx.createLinearGradient(x, 0, x + w, 0);
    for (let i = 0; i <= steps; i++) {
        grad.addColorStop(i / steps, colorFn(minVal + (maxVal - minVal) * i / steps));
    }
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#666'; ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);

    ctx.fillStyle = '#d8d8d8';
    ctx.font = '12px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.fillText(title, x, y - 3);
    ctx.textBaseline = 'top';
    ctx.fillText(minLabel, x, y + h + 3);
    ctx.textAlign = 'right';
    ctx.fillText(maxLabel, x + w, y + h + 3);
}

// ─── Obstacle vector graphics ─────────────────────────────────────────────────

/** Traffic cone (top-down perspective, side-lit). cx/cy = centre. */
export function drawCone(ctx, cx, cy) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 9, 10, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#f47c00';
    ctx.beginPath();
    ctx.moveTo(cx, cy - 13);
    ctx.lineTo(cx + 10, cy + 8);
    ctx.lineTo(cx - 10, cy + 8);
    ctx.closePath();
    ctx.fill();

    // White reflective band
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    const h = 21;
    const t1 = 9 / h, t2 = 14 / h;
    ctx.beginPath();
    ctx.moveTo(cx - 10 * t1, cy - 13 + h * t1);
    ctx.lineTo(cx + 10 * t1, cy - 13 + h * t1);
    ctx.lineTo(cx + 10 * t2, cy - 13 + h * t2);
    ctx.lineTo(cx - 10 * t2, cy - 13 + h * t2);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 8, 10, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

/** Traffic signal (front-facing icon). cx/cy = centre. isRed: true = red phase. */
export function drawTrafficLight(ctx, cx, cy, isRed) {
    ctx.save();
    // Pole
    ctx.fillStyle = '#606060';
    ctx.fillRect(cx - 2, cy + 2, 4, 11);

    // Housing
    const bw = 14, bh = 22;
    const bx = cx - bw / 2, by = cy - bh;
    ctx.fillStyle = '#111';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = '#444'; ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, bw, bh);

    // Red bulb
    const redY = by + 6;
    ctx.fillStyle = isRed ? '#ff2a2a' : '#2a0505';
    ctx.beginPath(); ctx.arc(cx, redY, 4, 0, Math.PI * 2); ctx.fill();
    if (isRed) {
        ctx.fillStyle = 'rgba(255,60,60,0.30)';
        ctx.beginPath(); ctx.arc(cx, redY, 9, 0, Math.PI * 2); ctx.fill();
    }

    // Green bulb
    const grnY = by + 16;
    ctx.fillStyle = !isRed ? '#22ff50' : '#052a0a';
    ctx.beginPath(); ctx.arc(cx, grnY, 4, 0, Math.PI * 2); ctx.fill();
    if (!isRed) {
        ctx.fillStyle = 'rgba(60,255,90,0.30)';
        ctx.beginPath(); ctx.arc(cx, grnY, 9, 0, Math.PI * 2); ctx.fill();
    }

    ctx.restore();
}

/** Jersey-barrier style road barrier (top-down perspective). cx/cy = centre. */
export function drawBarrier(ctx, cx, cy) {
    ctx.save();
    const W = 36, hTop = 8, hBase = 4;
    ctx.fillStyle = '#b0b0b0';
    ctx.fillRect(cx - W / 2, cy + hTop / 2, W, hBase);

    ctx.fillStyle = '#e0e0e0';
    ctx.fillRect(cx - W / 2 + 3, cy - hTop / 2, W - 6, hTop);

    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - W / 2 + 3, cy - hTop / 2, W - 6, hTop);
    ctx.clip();
    ctx.fillStyle = '#cc2200';
    for (let i = -3; i < 6; i++) {
        const sx = cx - W / 2 + 3 + i * 10;
        ctx.beginPath();
        ctx.moveTo(sx, cy - hTop / 2);
        ctx.lineTo(sx + 6, cy - hTop / 2);
        ctx.lineTo(sx + 6 + hTop, cy + hTop / 2);
        ctx.lineTo(sx + hTop, cy + hTop / 2);
        ctx.closePath();
        ctx.fill();
    }
    ctx.restore();

    ctx.strokeStyle = '#888';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(cx - W / 2 + 3, cy - hTop / 2, W - 6, hTop);
    ctx.strokeRect(cx - W / 2, cy + hTop / 2, W, hBase);
    ctx.restore();
}

// ─── Line plot ────────────────────────────────────────────────────────────────

export function drawLinePlot(ctx, canvas, title, yLabel, yMin, yMax, xMax, datasets, xLabel = 'x (m)') {
    ctx.fillStyle = '#161c1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const padL = 66, padR = 145, padT = 28, padB = 44;
    const pw  = canvas.width  - padL - padR;
    const ph  = canvas.height - padT - padB;
    const ax  = padL;
    const ab  = padT + ph;

    ctx.strokeStyle = '#c0c0c0'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(ax, padT); ctx.lineTo(ax, ab); ctx.lineTo(ax + pw, ab); ctx.stroke();

    ctx.fillStyle = '#f0f0f0';
    ctx.font = '13px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(title, 12, 6);

    const toY = v => ab - ph * clamp((v - yMin) / Math.max(yMax - yMin, 1e-9), 0, 1);

    ctx.font = '11px "Segoe UI", Arial, sans-serif';
    ctx.strokeStyle = '#3a4a40'; ctx.fillStyle = '#a8b5b0'; ctx.lineWidth = 1;

    for (let k = 0; k <= 8; k++) {
        const f = k / 8, xp = ax + f * pw;
        ctx.beginPath(); ctx.moveTo(xp, ab); ctx.lineTo(xp, ab + 5); ctx.stroke();
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText((f * xMax).toFixed(0), xp, ab + 7);
    }
    for (let k = 0; k <= 5; k++) {
        const f = k / 5, yp = ab - f * ph, val = yMin + f * (yMax - yMin);
        ctx.beginPath(); ctx.moveTo(ax - 5, yp); ctx.lineTo(ax, yp); ctx.stroke();
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        ctx.fillText(val.toFixed(2), ax - 8, yp);
    }

    ctx.fillStyle = '#d0d0d0';
    ctx.font = '12px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(xLabel, ax + pw / 2, ab + 26);
    ctx.save();
    ctx.translate(16, padT + ph / 2); ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.fillText(yLabel, 0, 0);
    ctx.restore();

    for (const { label, color, values } of datasets) {
        const n = values.length;
        ctx.strokeStyle = color; ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
            const xp = ax + (i / Math.max(n - 1, 1)) * pw;
            const yp = toY(values[i]);
            if (i === 0) ctx.moveTo(xp, yp); else ctx.lineTo(xp, yp);
        }
        ctx.stroke();
    }

    datasets.forEach(({ label, color }, idx) => {
        const lx = ax + pw + 10, ly = padT + idx * 18;
        ctx.fillStyle = color;
        ctx.fillRect(lx, ly + 4, 18, 3);
        ctx.fillStyle = '#d0d0d0';
        ctx.font = '11px "Segoe UI", Arial, sans-serif';
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(label, lx + 24, ly);
    });
}
