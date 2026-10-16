// Custom building designs: made by hand in the designer, or made by Claude from a photo of a real building.
// Designs are saved in this browser and appear in the Build menu.
import { makeSpec, TYPES } from './buildings.js';

const KEY = 'animal-town-designs-v1';
const API_KEY = 'animal-town-claude-key';

export const ROLES = ['home', 'apartment', 'shop', 'restaurant', 'office', 'hospital', 'school', 'police'];
export const ROOFS = ['flat', 'gable', 'hip', 'dome'];
export const WINDOWS = ['square', 'tall', 'wide', 'band', 'arch'];

export function loadDesigns() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}
export function saveDesigns(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage blocked */ }
}
export function getApiKey() { try { return localStorage.getItem(API_KEY) || ''; } catch { return ''; } }
export function setApiKey(k) { try { if (k) localStorage.setItem(API_KEY, k); else localStorage.removeItem(API_KEY); } catch { /* ignore */ } }

// a design -> full building spec the generator understands
export function designToSpec(d) {
  const role = ROLES.includes(d.role) ? d.role : 'office';
  return {
    ...makeSpec('custom'),
    type: 'custom', style: 'custom', role, name: d.name || '', emoji: d.emoji || '🏗️',
    tiles: [Math.min(3, Math.max(1, d.width | 0 || 1)), Math.min(3, Math.max(1, d.depth | 0 || 1))],
    floors: Math.min(20, Math.max(1, d.floors | 0 || 2)),
    roof: ROOFS.includes(d.roof) ? d.roof : 'flat',
    window: WINDOWS.includes(d.window) ? d.window : 'square',
    wall: d.wall || '#e8e2d6', roofColor: d.roofColor || '#4a4f5a', trim: d.trim || '#ffffff',
    band: d.band || null, balcony: !!d.balcony, columns: !!d.columns, chimney: !!d.chimney,
    awning: d.awning || null, clock: !!d.clock, domeColor: d.domeColor || '#d4a017',
  };
}
// which job works in a custom building
export const ROLE_TYPE = { shop: 'shop', restaurant: 'restaurant', hospital: 'hospital', school: 'school', police: 'police' };

// ---------- photo -> design with Claude ----------
const DESIGN_TOOL = {
  name: 'save_building_design',
  description: 'Save the design of the building in the photo so a simple 3D town game can rebuild it.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Short name for this building, in the language of the request (max 24 characters).' },
      emoji: { type: 'string', description: 'One emoji that represents the building.' },
      role: { type: 'string', enum: ROLES, description: 'What the building is used for.' },
      floors: { type: 'integer', description: 'Number of floors above ground, 1-20.' },
      width: { type: 'integer', description: 'Width in town tiles: 1 = house or small shop, 2 = wide building, 3 = very wide.' },
      depth: { type: 'integer', description: 'Depth in tiles, 1-3.' },
      roof: { type: 'string', enum: ROOFS },
      window: { type: 'string', enum: WINDOWS, description: 'band = continuous glass strip, arch = arched windows.' },
      wall: { type: 'string', description: 'Main wall colour as #rrggbb.' },
      roofColor: { type: 'string', description: 'Roof colour as #rrggbb.' },
      trim: { type: 'string', description: 'Window frame / trim colour as #rrggbb.' },
      band: { type: 'string', description: 'Colour of a horizontal stripe between floors as #rrggbb, or empty string if none.' },
      balcony: { type: 'boolean' },
      columns: { type: 'boolean', description: 'Columns at the entrance.' },
      chimney: { type: 'boolean' },
      awning: { type: 'string', description: 'Colour of a striped awning over the entrance as #rrggbb, or empty string if none.' },
      clock: { type: 'boolean' },
    },
    required: ['name', 'emoji', 'role', 'floors', 'width', 'depth', 'roof', 'window', 'wall', 'roofColor', 'trim', 'band', 'balcony', 'columns', 'chimney', 'awning', 'clock'],
    additionalProperties: false,
  },
};

// shrink the photo so the request stays small and cheap
async function photoToBase64(file) {
  const img = await createImageBitmap(file);
  const s = Math.min(1, 1024 / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * s);
  c.height = Math.round(img.height * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', .85).split(',')[1];
}

export async function designFromPhoto(file, lang) {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error('NO_KEY');
  const { default: Anthropic } = await import('https://esm.sh/@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const data = await photoToBase64(file);
  const response = await client.beta.messages.create({
    model: 'claude-opus-5-5',
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low' },
    tools: [DESIGN_TOOL],
    tool_choice: { type: 'auto' },
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } },
        { type: 'text', text: `This is a photo of a real building. Describe it for a cartoon 3D town game by calling the save_building_design tool once. Pick the closest options and the main colours you see. Write the name in ${lang === 'ar' ? 'Arabic' : 'English'}.` },
      ],
    }],
  });
  if (response.stop_reason === 'refusal') throw new Error('REFUSED');
  const call = response.content.find(b => b.type === 'tool_use' && b.name === DESIGN_TOOL.name);
  if (!call) throw new Error('NO_DESIGN');
  const d = call.input;
  return { ...d, band: d.band || null, awning: d.awning || null, id: Date.now() };
}

export function hasType(type) { return !!TYPES[type]; }
