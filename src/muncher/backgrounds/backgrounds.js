/* eslint-disable no-await-in-loop */
import logger from "../../logger.js";
import { generateBackground } from "../../parser/character/bio.js";
import { parseTags } from "../../lib/DDBTemplateStrings.js";
import DDBHelper from "../../lib/DDBHelper.js";
import { generateTable } from "../table.js";
import DDBItemImporter from "../../lib/DDBItemImporter.js";

const BACKGROUND_TEMPLATE = {
  "name": "",
  "type": "background",
  "system": {
    "description": {
      "value": "",
      "chat": "",
      "unidentified": ""
    },
    "type": {
      "value": "background",
    },
    "source": "",
  },
  "sort": 2600000,
  "flags": {
    "ddbimporter": {},
    "obsidian": {
      "source": {
        "type": "background"
      }
    },
  },
  "img": "icons/skills/trades/academics-book-study-purple.webp",
};

async function buildBase(data) {
  let result = duplicate(BACKGROUND_TEMPLATE);
  const bgData = generateBackground(data);
  result.name = data.name;
  result.system.description.value += `${bgData.description}\n\n`;

  result.flags.ddbimporter = {
    featId: data.id,
    version: CONFIG.DDBI.version,
  };

  result.system.source = DDBHelper.parseSource(data);
  result.system.description.value = parseTags(result.system.description.value);
  result.system.description.value = await generateTable(result.name, result.system.description.value, true, "background");

  return result;
}


async function buildBackground(background) {
  let result = await buildBase(background);

  return result;
}


export async function getBackgrounds(data) {
  logger.debug("get backgrounds started");
  const updateBool = game.settings.get("ddb-importer", "munching-policy-update-existing");

  let backgrounds = [];

  for (const background of data) {
    logger.debug(`${background.name} background parsing started...`);
    const parsedBackground = await buildBackground(background);
    backgrounds.push(parsedBackground);
  }

  const itemHandler = await DDBItemImporter.buildHandler("backgrounds", backgrounds, updateBool, { chrisPremades: true });
  return itemHandler.documents;
}
