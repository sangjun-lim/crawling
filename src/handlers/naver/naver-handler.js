import { runMapMode } from './map-handler.js';
import { runShoppingMode } from './shopping-handler.js';
import { runSmartstoreMode } from './smartstore-handler.js';
import { showNaverUsage } from '../common/usage-helper.js';

export async function handleNaver(mode, args, config) {
  switch (mode) {
    case 'map':
      await runMapMode(args, config);
      break;
    case 'shopping':
      await runShoppingMode(args, config);
      break;
    case 'smartstore':
      await runSmartstoreMode(args, config);
      break;
    default:
      showNaverUsage();
  }
}