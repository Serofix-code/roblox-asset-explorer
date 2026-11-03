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
    if (match) return { id: match[2] || match[1], bundle: (match[1] || '').toLowerCase() === 'bundles' };
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


async function downloadTemplate(assetId, button, status) {
  button.disabled = true;
  status.textContent = 'Resolving original clothing template…';
  try {
    const proxy = 'https://proxy.cors.dev/';
    const modelResponse = await fetch(proxy + 'https://assetdelivery.roblox.com/v1/asset?id=' + encodeURIComponent(assetId), { signal: AbortSignal.timeout(15000) });
    if (modelResponse.status === 401 || modelResponse.status === 403) throw new Error('Roblox requires authorized access to the original asset. Public GitHub Pages cannot retrieve this template');
    if (!modelResponse.ok) throw new Error('Roblox asset delivery returned ' + modelResponse.status);
    const xml = await modelResponse.text();
    if (xml.length > 1000000) throw new Error('Unexpected asset response');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('Roblox did not return readable clothing data');
    const clothing = [...doc.querySelectorAll('Item')].find(x => ['Shirt','Pants','ShirtGraphic'].includes(x.getAttribute('class')));
    if (!clothing) throw new Error('This asset is not a supported classic shirt, pants, or T-shirt');
    const field = clothing.getAttribute('class') === 'Shirt' ? 'ShirtTemplate' : clothing.getAttribute('class') === 'Pants' ? 'PantsTemplate' : 'Graphic';
    const content = [...clothing.querySelectorAll('Content')].find(x => x.getAttribute('name') === field);
    const value = content?.textContent?.trim() || '';
    const match = value.match(/(?:rbxassetid:\/\/|[?&]id=)(\d{1,20})/i);
    if (!match) throw new Error('Could not find the original template image ID');
    const templateId = match[1];
    status.textContent = 'Downloading original template image #' + templateId + '…';
    const imageResponse = await fetch(proxy + 'https://assetdelivery.roblox.com/v1/asset?id=' + templateId, { signal: AbortSignal.timeout(20000) });
    if (imageResponse.status === 401 || imageResponse.status === 403) throw new Error('Roblox requires authorized access to the template image');
    if (!imageResponse.ok) throw new Error('Template download returned ' + imageResponse.status);
    const bytes = await imageResponse.blob();
    const header = new Uint8Array(await bytes.slice(0, 12).arrayBuffer());
    const png = header[0] === 137 && header[1] === 80 && header[2] === 78 && header[3] === 71;
    const jpg = header[0] === 255 && header[1] === 216;
    if (!png && !jpg) throw new Error('The template endpoint did not return a PNG or JPEG image');
    const objectUrl = URL.createObjectURL(bytes);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = 'roblox-' + assetId + '-template.' + (png ? 'png' : 'jpg');
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 15000);
    status.textContent = 'Original clothing template downloaded (image ID #' + templateId + ').';
  } catch (error) {
    status.textContent = 'Template unavailable: ' + error.message + '. For clothing you own or have permission to use, Roblox Studio can access the ShirtTemplate/PantsTemplate property.';
  } finally {
    button.disabled = false;
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
  const description = node('p', 'Download the public thumbnail or try retrieving the original texture for a classic shirt, pants, or T-shirt. Template downloads depend on Roblox asset access.');
  const actions = node('div', undefined, 'links');
  const download = node('button', 'Download preview PNG');
  download.type = 'button';
  download.disabled = true;
  download.className = 'download';
  actions.append(download);
  const templateDownload = node('button', 'Download clothing template');
  templateDownload.type = 'button';
  templateDownload.className = 'download';
  templateDownload.onclick = () => downloadTemplate(id, templateDownload, status);
  actions.append(templateDownload);
  const url = bundle ? 'https://www.roblox.com/bundles/' + id : 'https://www.roblox.com/catalog/' + id;
  actions.append(link('View on Roblox ↗', url));
  details.append(description, status, actions);
  const content = node('div', undefined, 'content');
  content.append(image, details);
  result.replaceChildren(title, content);

  function showFallback() {
    if (request !== requestNumber) return;
    const fallbackUrl = 'https://www.roblox.com/asset-thumbnail/image?assetId=' + encodeURIComponent(id) + '&width=420&height=420&format=png';
    image.hidden = false;
    image.onerror = () => {
      image.hidden = true;
      download.disabled = true;
      status.textContent = 'Roblox did not provide a public thumbnail for this asset.';
    };
    image.onload = () => {
      download.disabled = false;
      status.textContent = 'Preview loaded through the image fallback.';
    };
    image.src = fallbackUrl;
    download.onclick = () => saveImage(fallbackUrl, id, status);
    status.textContent = 'Trying alternate thumbnail source…';
  }

  try {
    // Roblox's thumbnail API does not allow cross-origin browser requests.
    // This proxy requests public thumbnail metadata without account credentials.
    const response = await fetch('https://proxy.cors.dev/' + thumbnailEndpoint(asset), { signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error('Thumbnail service returned ' + response.status);
    const data = await response.json();
    if (request !== requestNumber) return;
    const item = data?.data?.[0];
    const imageUrl = item?.imageUrl;
    if (!imageUrl || !/^https:\/\//i.test(imageUrl)) {
      showFallback();
      return;
    }
    image.src = imageUrl;
    image.hidden = false;
    image.onerror = () => showFallback();
    download.disabled = false;
    download.onclick = () => saveImage(imageUrl, id, status);
    status.textContent = 'Public thumbnail available.';
  } catch {
    if (request === requestNumber) showFallback();
  }
});
