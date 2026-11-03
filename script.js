'use strict';

const form = document.getElementById('lookup');
const input = document.getElementById('asset');
const result = document.getElementById('result');
let requestNumber = 0;

function parseAsset(value) {
  const raw = value.trim();
  if (/^\d{1,20}$/.test(raw)) return { id: raw, bundle: false };
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw);
    if (!/(^|\.)roblox\.com$/i.test(url.hostname)) return null;
    const match = url.pathname.match(/\/(catalog|library|bundles|asset|game-pass|badges)\/(\d{1,20})(?:\/|$)/i);
    if (match) return { id: match[2], bundle: match[1].toLowerCase() === 'bundles' };
    const id = url.searchParams.get('id') || url.searchParams.get('assetId');
    if (/^\d{1,20}$/.test(id || '')) return { id, bundle: false };
  } catch { /* Invalid URL */ }
  return null;
}

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}
function link(label, href) {
  const a = node('a', label);
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}
function thumbnailEndpoint({ id, bundle }) {
  return bundle
    ? 'https://thumbnails.roblox.com/v1/bundles/thumbnails?bundleIds=' + id + '&size=420x420&format=Png&isCircular=false'
    : 'https://thumbnails.roblox.com/v1/assets?assetIds=' + id + '&size=420x420&format=Png&isCircular=false';
}
async function saveImage(url, id, status) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Image request failed');
    const blob = await response.blob();
    const localUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = localUrl;
    a.download = 'roblox-' + id + '-thumbnail.png';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(localUrl), 15000);
    status.textContent = 'Thumbnail download started.';
  } catch {
    status.textContent = 'Direct download is blocked by the image host. Opening the image instead; save it from your browser.';
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  const request = ++requestNumber;
  const asset = parseAsset(input.value);
  result.hidden = false;
  if (!asset) {
    result.replaceChildren(node('h2', 'Invalid asset ID or URL'), node('p', 'Use a numeric asset ID (such as 14497343428) or a Roblox catalog, library, bundle, or asset link.'));
    return;
  }

  const { id, bundle } = asset;
  const title = node('h2', 'Asset #' + id);
  const status = node('p', 'Loading public preview…', 'status');
  const image = node('img', undefined, 'preview');
  image.alt = 'Roblox asset #' + id + ' thumbnail';
  image.hidden = true;

  const details = node('div', undefined, 'details');
  const description = node('p', 'Preview and download the public thumbnail image. Original asset files and clothing templates are not available in this version.');
  const actions = node('div', undefined, 'links');
  const download = node('button', 'Download preview PNG');
  download.type = 'button';
  download.disabled = true;
  download.className = 'download';
  actions.append(download);
  const url = bundle ? 'https://www.roblox.com/bundles/' + id : 'https://www.roblox.com/catalog/' + id;
  actions.append(link('View on Roblox ↗', url));
  details.append(description, status, actions);
  const content = node('div', undefined, 'content');
  content.append(image, details);
  result.replaceChildren(title, content);

  try {
    const response = await fetch(thumbnailEndpoint(asset), { signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error('Thumbnail service returned ' + response.status);
    const data = await response.json();
    if (request !== requestNumber) return;
    const item = data?.data?.[0];
    const imageUrl = item?.imageUrl;
    if (!imageUrl || !/^https:\/\//i.test(imageUrl)) {
      status.textContent = item?.state === 'Pending' ? 'Thumbnail is still processing. Try again shortly.' : 'No public preview is available for this asset.';
      return;
    }
    image.src = imageUrl;
    image.hidden = false;
    image.onerror = () => { status.textContent = 'The thumbnail could not be displayed.'; download.disabled = true; };
    download.disabled = false;
    download.onclick = () => saveImage(imageUrl, id, status);
    status.textContent = 'Public thumbnail available.';
  } catch {
    if (request === requestNumber) status.textContent = 'Could not retrieve a preview. Roblox may restrict browser access to this endpoint.';
  }
});
