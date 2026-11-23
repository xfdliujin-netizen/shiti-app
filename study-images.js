function isStudyImage(src) {
  return typeof src === 'string' && /^data:image\/(jpeg|png|webp|gif);base64,[a-zA-Z0-9+/=]+$/.test(src);
}

function validFigureRegion(region) {
  if (!region || !['x', 'y', 'w', 'h'].every(key => Number.isFinite(region[key]))) return false;
  const { x, y, w, h } = region;
  return x >= 0 && y >= 0 && w >= .01 && h >= .01 && x + w <= 1.000001 && y + h <= 1.000001;
}

async function studyImageCopy(src, mode = 'original', region = null) {
  const crop = validFigureRegion(region);
  if (mode === 'original' && !crop) return src;
  if (!isStudyImage(src)) throw Error('图片格式无效');
  const image = new Image();
  image.src = src;
  await image.decode();
  const { naturalWidth: width, naturalHeight: height } = image;
  const box = crop ? region : { x: 0, y: 0, w: 1, h: 1 };
  const scale = Math.min(1, 1800 / Math.max(width * box.w, height * box.h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * box.w * scale));
  canvas.height = Math.max(1, Math.round(height * box.h * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: mode !== 'original' });
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, width * box.x, height * box.y, width * box.w, height * box.h, 0, 0, canvas.width, canvas.height);
  if (mode !== 'original') {
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    whitenStudyPaper(pixels, mode === 'bw');
    ctx.putImageData(pixels, 0, 0);
  }
  return mode === 'bw' ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', .9);
}

async function joinStudyPages(first, second) {
  const images = await Promise.all([first, second].map(async src => {
    if (!isStudyImage(src)) throw Error('续页图片格式无效');
    const image = new Image();
    image.src = src;
    await image.decode();
    return image;
  }));
  const ratios = images.map(image => image.naturalHeight / image.naturalWidth);
  const width = Math.max(1, Math.floor(Math.min(1600, 4096 / (ratios[0] + ratios[1]), Math.max(...images.map(image => image.naturalWidth)))));
  const heights = ratios.map(ratio => Math.max(1, Math.floor(width * ratio)));
  if (heights[0] + heights[1] > 4096) throw Error('续页图片比例过长，请先框选本题区域');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = heights[0] + heights[1];
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(images[0], 0, 0, width, heights[0]);
  ctx.drawImage(images[1], 0, heights[0], width, heights[1]);
  const src = canvas.toDataURL('image/jpeg', .88);
  if (!isStudyImage(src)) throw Error('续页合并失败，请先将照片框小一些');
  return { src, firstFraction: heights[0] / canvas.height };
}

function whitenStudyPaper({ width, height, data }, blackWhite) {
  // Estimate paper from the bright part of each neighborhood, excluding isolated glare.
  const step = Math.max(12, Math.round(Math.min(width, height) / 20));
  const cols = Math.ceil(width / step), rows = Math.ceil(height / step);
  const bins = 32;
  const histogram = new Uint32Array(cols * rows * bins);
  const background = new Uint8Array(cols * rows);
  for (let y = 0; y < height; y++) {
    const row = Math.floor(y / step) * cols;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const value = Math.round(.299 * data[i] + .587 * data[i + 1] + .114 * data[i + 2]);
      data[i] = value;
      histogram[(row + Math.floor(x / step)) * bins + (value >> 3)]++;
    }
  }
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cell = row * cols + col;
      const pixels = Math.min(step, width - col * step) * Math.min(step, height - row * step);
      const brightCount = Math.ceil(pixels * .18);
      let seen = 0;
      for (let bin = bins - 1; bin >= 0; bin--) {
        seen += histogram[cell * bins + bin];
        if (seen < brightCount) continue;
        background[cell] = Math.max(60, bin * 8 + 4);
        break;
      }
    }
  }
  const paperAt = (x, y) => background[y * cols + x];
  for (let y = 0; y < height; y++) {
    const gy = Math.max(0, y / step - .5), top = Math.floor(gy), bottom = Math.min(rows - 1, top + 1);
    for (let x = 0; x < width; x++) {
      const gx = Math.max(0, x / step - .5), left = Math.floor(gx), right = Math.min(cols - 1, left + 1);
      const upper = paperAt(left, top) + (paperAt(right, top) - paperAt(left, top)) * (gx - left);
      const lower = paperAt(left, bottom) + (paperAt(right, bottom) - paperAt(left, bottom)) * (gx - left);
      const paper = upper + (lower - upper) * (gy - top);
      const i = (y * width + x) * 4;
      const gap = paper - data[i];
      const value = blackWhite
        ? (gap >= Math.max(12, paper * .15) ? 0 : 255)
        : 255 - Math.max(0, gap - Math.max(8, paper * .055)) / paper * 580;
      data[i] = data[i + 1] = data[i + 2] = value;
    }
  }
}

async function openFigurePicker(src, previous, { forHomework = false, forSubmission = false } = {}) {
  if (!isStudyImage(src)) throw Error('没有可框选的原题图片');
  const dialog = document.createElement('dialog');
  dialog.className = 'figure-picker';
  dialog.setAttribute('aria-labelledby', 'figure-picker-title');
  dialog.innerHTML = `<header class="figure-picker-header">
      <h2 id="figure-picker-title">${forSubmission ? '框选处理范围' : forHomework ? '调整切题范围' : '保留题目配图'}</h2>
      <button type="button" class="dialog-x" data-close aria-label="关闭题图窗口" autofocus>×</button>
    </header>
    <div class="figure-picker-body">
      <p class="hint">在图上拖出选框，再从框内拖动可移动。需要换大小时点「重画」。</p>
      <div class="figure-image-pane">
        <div class="figure-stage"><img alt="待框选的原题图片" draggable="false"><span hidden></span></div>
      </div>
    </div>
    <footer class="figure-picker-footer">
      <button type="button" class="text-button" data-redraw disabled>重画</button>
      ${!forHomework && !forSubmission && validFigureRegion(previous) ? '<button type="button" class="text-button" data-clear>移除题图</button>' : ''}
      <button type="button" class="secondary" data-cancel>取消</button>
      <button type="button" class="primary" data-confirm disabled>${forSubmission ? '确认框选' : forHomework ? '确认切题范围' : '保存题图'}</button>
    </footer>`;
  const stage = dialog.querySelector('.figure-stage');
  const image = stage.querySelector('img');
  const outline = stage.querySelector('span');
  const confirm = dialog.querySelector('[data-confirm]');
  const redraw = dialog.querySelector('[data-redraw]');
  image.src = src;
  await image.decode();
  stage.style.setProperty('--figure-ratio', image.naturalWidth / image.naturalHeight);
  let region = previous, start, regionBeforeDrag, moving, pointer, result;
  function draw() {
    const valid = validFigureRegion(region);
    outline.hidden = !valid;
    confirm.disabled = !valid || pointer !== undefined;
    redraw.disabled = confirm.disabled;
    if (valid) Object.assign(outline.style, {
      left: region.x * 100 + '%', top: region.y * 100 + '%',
      width: region.w * 100 + '%', height: region.h * 100 + '%'
    });
  }
  function point(event) {
    const box = image.getBoundingClientRect();
    return { x: clampFigureValue((event.clientX - box.left) / box.width), y: clampFigureValue((event.clientY - box.top) / box.height) };
  }
  stage.onpointerdown = event => {
    if (!event.isPrimary || event.button !== 0 || pointer !== undefined) return;
    stage.setPointerCapture(event.pointerId);
    pointer = event.pointerId;
    start = point(event);
    regionBeforeDrag = region;
    moving = validFigureRegion(region) && start.x >= region.x && start.x <= region.x + region.w &&
      start.y >= region.y && start.y <= region.y + region.h;
    confirm.disabled = true;
  };
  function move(event) {
    const end = point(event);
    if (moving) {
      region = {
        ...regionBeforeDrag,
        x: clampFigureValue(regionBeforeDrag.x + end.x - start.x, 1 - regionBeforeDrag.w),
        y: clampFigureValue(regionBeforeDrag.y + end.y - start.y, 1 - regionBeforeDrag.h)
      };
      return;
    }
    region = { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), w: Math.abs(start.x - end.x), h: Math.abs(start.y - end.y) };
  }
  stage.onpointermove = event => { if (event.pointerId === pointer) { move(event); draw(); } };
  stage.onpointerup = event => {
    if (event.pointerId !== pointer) return;
    move(event);
    if (!validFigureRegion(region)) region = regionBeforeDrag;
    pointer = undefined;
    draw();
  };
  stage.onpointercancel = () => { pointer = undefined; region = regionBeforeDrag; draw(); };
  redraw.onclick = () => { region = null; draw(); };
  dialog.querySelectorAll('[data-cancel], [data-close]').forEach(button => {
    button.onclick = () => dialog.close();
  });
  const clear = dialog.querySelector('[data-clear]');
  if (clear) clear.onclick = () => { result = null; dialog.close(); };
  confirm.onclick = () => { if (validFigureRegion(region)) { result = region; dialog.close(); } };
  document.body.append(dialog);
  draw();
  dialog.showModal();
  return new Promise(resolve => dialog.addEventListener('close', () => { dialog.remove(); resolve(result); }, { once: true }));
}

function clampFigureValue(value, maximum = 1) {
  return Math.min(maximum, Math.max(0, value));
}

function showSavedFigure(container, src, region) {
  if (!container || !validFigureRegion(region)) return;
  studyImageCopy(src, 'original', region).then(copy => {
    if (!container.isConnected) return;
    const image = document.createElement('img');
    image.src = copy;
    image.alt = '题目配图';
    image.className = 'saved-figure';
    container.replaceChildren(image);
  }).catch(() => { container.textContent = '题图无法载入，请查看原图。'; });
}
