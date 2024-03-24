/* eslint-disable no-await-in-loop */
/* eslint-disable no-continue */
/* eslint-disable require-atomic-updates */
import DICTIONARY from "../dictionary.js";
import FolderHelper from "../lib/FolderHelper.js";
import logger from "../logger.js";
import SETTINGS from "../settings.js";
import ChrisPremadesHelper from "./external/ChrisPremadesHelper.js";


function getType(doc, isMonster = false) {
  if (DICTIONARY.types.inventory.includes(doc.type)) {
    return "inventory";
  }
  if (doc.type !== "feat") return doc.type;

  // feats cover a variety of sins, lets try and narrow it down
  if (isMonster) return "monsterfeature";

  // lets see if we have marked this as a class or race type
  const systemTypeValue = foundry.utils.getProperty(doc, "system.type.value");
  if (systemTypeValue && systemTypeValue !== "") {
    if (systemTypeValue === "class") return "feature";
    if (systemTypeValue === "race") return "trait";
    return systemTypeValue;
  }

  // can we derive the type from the ddb importer type flag?
  const ddbType = foundry.utils.getProperty(doc, "flags.ddbimporter.type");
  if (ddbType && !["", "other"].includes(ddbType)) {
    if (ddbType === "class") return "feature";
    if (ddbType === "race") return "trait";
    return ddbType;
  }

  if (doc.type === "feat") {
    return "feature";
  }

  return doc.type;
}

export async function applyChrisPremadeEffect({ document, type, folderName = null, chrisNameOverride = null } = {}) {
  if (!game.modules.get("chris-premades")?.active) return document;
  if (foundry.utils.getProperty(document, "flags.ddbimporter.ignoreItemForChrisPremades") === true) {
    logger.info(`${document.name} set to ignore Chris's Premade effect application`);
    return document;
  }


  const compendiumName = SETTINGS.CHRIS_PREMADES_COMPENDIUM.find((c) => c.type === type)?.name;


  if (!compendiumName) {
    logger.warn(`No compendium found for Chris's Premade effect for ${type} and ${document.name}!`);
    return document;
  }
  // .split("(")[0].trim()
  const ddbName = ChrisPremadesHelper.getOriginalName(document);
  const chrisName = chrisNameOverride ?? CONFIG.chrisPremades?.renamedItems[ddbName] ?? ddbName;
  const folderId = ["monsterfeatures", "monsterfeature"].includes(type)
    ? await FolderHelper.getCompendiumFolderId((folderName ?? chrisName), compendiumName)
    : undefined;

  // expected to find feature in a folder, but we could not
  if (folderName && folderId === undefined) {
    logger.debug(`No folder found for ${folderName} and ${document.name}, using compendium name ${compendiumName}`);
    return document;
  }

  logger.debug(`CP Effect: Attempting to fetch ${document.name} from ${compendiumName} with folderID ${folderId}`);
  // const chrisDoc = await chrisPremades.helpers.getItemFromCompendium(compendiumName, chrisName, true, folderId);
  const chrisDoc = await ChrisPremadesHelper.getItemFromCompendium(compendiumName, chrisName, true, folderId);
  if (!chrisDoc) {
    logger.debug(`No CP Effect found for ${document.name} from ${compendiumName} with folderID ${folderId}`);
    return document;
  }

  ChrisPremadesHelper.DDB_FLAGS_TO_REMOVE.forEach((flagName) => {
    delete document.flags[flagName];
  });

  document.effects = [];

  ChrisPremadesHelper.CP_FLAGS_TO_REMOVE.forEach((flagName) => {
    delete chrisDoc.flags[flagName];
  });

  document.flags = foundry.utils.mergeObject(document.flags, chrisDoc.flags);

  ChrisPremadesHelper.CP_FIELDS_TO_COPY.forEach((field) => {
    const values = foundry.utils.getProperty(chrisDoc, field);
    if (field === "effects") {
      values.forEach((effect) => {
        effect._id = foundry.utils.randomID();
      });
    }
    foundry.utils.setProperty(document, field, values);
  });

  foundry.utils.setProperty(document, "flags.ddbimporter.effectsApplied", true);
  foundry.utils.setProperty(document, "flags.ddbimporter.chrisEffectsApplied", true);
  foundry.utils.setProperty(document, "flags.ddbimporter.chrisPreEffectName", ddbName);

  const correctionProperties = foundry.utils.getProperty(CONFIG, `chrisPremades.correctedItems.${chrisName}`);
  if (correctionProperties) {
    logger.debug(`Updating ${document.name} with a Chris correction properties`);
    document = foundry.utils.mergeObject(document, correctionProperties);
  }

  logger.debug(`Updated ${document.name} with a Chris effect`);
  delete document.folder;

  return document;
}


export async function applyChrisPremadeEffects({ documents, compendiumItem = false, force = false, isMonster = false, folderName = null } = {}) {
  if (!game.modules.get("chris-premades")?.active) {
    logger.debug("Chris Premades not active");
    return documents;
  }

  const applyChrisEffects = force || (compendiumItem
    ? game.settings.get(SETTINGS.MODULE_ID, "munching-policy-use-chris-premades")
    : game.settings.get(SETTINGS.MODULE_ID, "character-update-policy-use-chris-premades"));
  if (!applyChrisEffects) {
    logger.debug("Not Applying basic premades");
    return documents;
  }

  for (let doc of documents) {
    if (["class", "subclass", "background"].includes(doc.type)) continue;
    const type = getType(doc, isMonster);
    logger.debug(`Evaluating ${doc.name} of type ${type} for Chris's Premade application.`, { type, folderName });

    doc = await applyChrisPremadeEffect({ document: doc, type, folderName });
    if (isMonster && !["monsterfeatures", "monsterfeature"].includes(type) && !foundry.utils.getProperty(document, "flags.ddbimporter.effectsApplied") === true) {
      logger.debug(`No Chris' Premade found for ${doc.name} with type "${type}", checking for monster feature.`);
      doc = await applyChrisPremadeEffect({ document: doc, type: "monsterfeature", folderName });
    }
  }

  return documents;
}


// eslint-disable-next-line complexity
export async function restrictedItemReplacer(actor, folderName = null) {
  if (!game.modules.get("chris-premades")?.active) return;
  logger.debug("Beginning additions and removals of restricted effects.");

  const documents = actor.getEmbeddedCollection("Item").toObject();
  const restrictedItems = foundry.utils.getProperty(CONFIG, `chrisPremades.restrictedItems`);

  const sortedItems = Object.keys(restrictedItems).map((key) => {
    const data = restrictedItems[key];
    data["key"] = key;
    return data;
  }).sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
  const toAdd = [];
  const toDelete = [];

  for (const restrictedItem of sortedItems) {
    logger.debug(`Checking restricted Item ${restrictedItem.key}: ${restrictedItem.originalName}`);
    const doc = documents.find((d) => {
      const ddbName = d.flags.ddbimporter?.chrisPreEffectName ?? ChrisPremadesHelper.getOriginalName(d);
      const retainDoc = foundry.utils.getProperty(document, "flags.ddbimporter.ignoreItemForChrisPremades") === true;
      return ddbName === restrictedItem.originalName && !retainDoc;
    });
    if (!doc) continue;
    if (["class", "subclass", "background"].includes(doc.type)) continue;
    const ddbName = doc.flags.ddbimporter?.chrisPreEffectName ?? ChrisPremadesHelper.getOriginalName(doc);

    const rollData = actor.getRollData();

    if (restrictedItem.requiredClass && !rollData.classes[restrictedItem.requiredClass.toLowerCase()]) continue;
    if (restrictedItem.requiredSubclass) {
      const subClassData = rollData.classes[restrictedItem.requiredClass.toLowerCase()].subclass;
      if (!subClassData) continue;
      if (subClassData.parent.name.toLowerCase() !== restrictedItem.requiredSubclass.toLowerCase()) continue;
    }
    if (restrictedItem.requiredRace
      && restrictedItem.requiredRace.toLocaleLowerCase() !== (rollData.details.race?.name ?? rollData.details?.race)?.toLocaleLowerCase()
    ) continue;


    if (restrictedItem.requiredEquipment) {
      for (const requiredEquipment of restrictedItem.requiredEquipment) {
        const itemMatch = documents.some((d) => ddbName === requiredEquipment && DICTIONARY.types.inventory.includes(d.type));
        if (!itemMatch) continue;
      }
    }

    if (restrictedItem.requiredFeature) {
      for (const requiredFeature of restrictedItem.requiredFeature) {
        const itemMatch = documents.some((d) => ddbName === requiredFeature && d.type === "feat");
        if (!itemMatch) continue;
      }
    }

    if (restrictedItem.requiredFeatures) {
      for (const requiredFeature of restrictedItem.requiredFeatures) {
        const itemMatch = documents.some((d) => ddbName === requiredFeature && d.type === "feat");
        if (!itemMatch) continue;
      }
    }

    // now replace the matched item with the replaced Item
    if (restrictedItem.replacedItemName && restrictedItem.replacedItemName !== "") {
      logger.debug(`Replacing item data for ${ddbName}, using restricted data from ${restrictedItem.key}`);
      let document = foundry.utils.duplicate(doc);
      const type = getType(document);
      document = await applyChrisPremadeEffect({ document, type, folderName, chrisNameOverride: restrictedItem.replacedItemName });
      await actor.deleteEmbeddedDocuments("Item", [doc._id]);
      await actor.createEmbeddedDocuments("Item", [document], { keepId: true });
    }


    if (restrictedItem.additionalItems && restrictedItem.additionalItems.length > 0) {
      logger.debug(`Adding new items for ${ddbName}, using restricted data from ${restrictedItem.key}`);
      // come back and make this work
      const docAdd = documents.find((d) => d.name === ddbName);
      if (docAdd) {
        const type = getType(docAdd);
        const compendiumName = SETTINGS.CHRIS_PREMADES_COMPENDIUM.find((c) => c.type === type)?.name;
        if (!compendiumName) {
          logger.debug(`No Chris Compendium mapping for ${type} yet parsing ${docAdd.name}`);
        }
        const folderId = ["monsterfeatures", "monsterfeature"].includes(type)
          ? await FolderHelper.getCompendiumFolderId((folderName ?? ddbName), compendiumName)
          : undefined;

        for (const newItemName of restrictedItem.additionalItems) {
          logger.debug(`Adding new item ${newItemName}`);
          // const chrisDoc = await chrisPremades.helpers.getItemFromCompendium(compendiumName, newItemName, true, folderId);
          const chrisDoc = await ChrisPremadesHelper.getItemFromCompendium(compendiumName, newItemName, true, folderId);
          // eslint-disable-next-line max-depth
          if (!chrisDoc) {
            logger.error(`DDB Importer expected to find an item in Chris's Premades for ${newItemName} but did not`, {
              ddbName,
              doc: docAdd,
              additionalItems: restrictedItem.additionalItems,
              documents,
              compendiumName,
            });
          } else if (!documents.some((d) => d.name === chrisDoc.name)) {
            foundry.utils.setProperty(chrisDoc, "flags.ddbimporter.ignoreItemUpdate", true);
            toAdd.push(chrisDoc);
          }
        }
      }
    }

    if (restrictedItem.removedItems && restrictedItem.removedItems.length > 0) {
      logger.debug(`Removing items for ${ddbName}, using restricted data from ${restrictedItem.key}`);
      for (const removeItemName of restrictedItem.removedItems) {
        logger.debug(`Removing item ${removeItemName}`);
        const deleteDoc = documents.find((d) => ChrisPremadesHelper.getOriginalName(d) === removeItemName);
        if (deleteDoc) toDelete.push(deleteDoc._id);
      }
    }

  }

  logger.debug("Adding and removing the following restricted Chris's Premades", {
    toDelete,
    toAdd,
  });
  await actor.deleteEmbeddedDocuments("Item", toDelete);
  await actor.createEmbeddedDocuments("Item", toAdd);

}

export async function addAndReplaceRedundantChrisDocuments(actor, folderName = null) {
  if (!game.modules.get("chris-premades")?.active) return;
  logger.debug("Beginning additions and removals of extra effects.");
  const documents = actor.getEmbeddedCollection("Item").toObject();
  const toAdd = [];
  const toDelete = [];

  for (let doc of documents) {
    if (["class", "subclass", "background"].includes(doc.type)) continue;
    const type = getType(doc);
    const compendiumName = SETTINGS.CHRIS_PREMADES_COMPENDIUM.find((c) => c.type === type)?.name;
    if (!compendiumName) {
      logger.debug(`No Chris Compendium mapping for ${type} yet parsing ${doc.name}`);
      continue;
    }

    const ddbName = ChrisPremadesHelper.getOriginalName(doc);
    const chrisName = CONFIG.chrisPremades?.renamedItems[ddbName] ?? ddbName;
    const newItemNames = foundry.utils.getProperty(CONFIG, `chrisPremades.additionalItems.${chrisName}`);

    if (newItemNames) {
      logger.debug(`Adding new items for ${chrisName}`);
      const folderId = ["monsterfeatures", "monsterfeature"].includes(type)
        ? await FolderHelper.getCompendiumFolderId((folderName ?? chrisName), compendiumName)
        : undefined;

      for (const newItemName of newItemNames) {
        logger.debug(`Adding new item ${newItemName}`);
        // const chrisDoc = await chrisPremades.helpers.getItemFromCompendium(compendiumName, newItemName, true, folderId);
        const chrisDoc = await ChrisPremadesHelper.getItemFromCompendium(compendiumName, newItemName, true, folderId);
        if (!chrisDoc) {
          logger.error(`DDB Importer expected to find an item in Chris's Premades for ${newItemName} but did not`, {
            ddbName,
            doc,
            chrisName,
            newItemNames,
            documents,
            compendiumName,
          });
        } else if (!documents.some((d) => d.name === chrisDoc.name)) {
          foundry.utils.setProperty(chrisDoc, "flags.ddbimporter.ignoreItemUpdate", true);
          toAdd.push(chrisDoc);
        }
      }
    }

    const itemsToRemoveNames = foundry.utils.getProperty(CONFIG, `chrisPremades.removedItems.${chrisName}`);
    if (itemsToRemoveNames) {
      logger.debug(`Removing items for ${chrisName}`);
      for (const removeItemName of itemsToRemoveNames) {
        logger.debug(`Removing item ${removeItemName}`);
        const deleteDoc = documents.find((d) => ChrisPremadesHelper.getOriginalName(d) === removeItemName);
        if (deleteDoc) toDelete.push(deleteDoc._id);
      }
    }
  }

  logger.debug("Final Chris's Premades list", {
    toDelete,
    toAdd,
  });
  await actor.deleteEmbeddedDocuments("Item", toDelete);
  await actor.createEmbeddedDocuments("Item", toAdd);

}

export async function addChrisEffectsToActorDocuments(actor) {
  if (!game.modules.get("chris-premades")?.active) {
    ui.notifications.error("Chris Premades module not installed");
    return [];
  }

  logger.info("Starting to update actor documents with Chris Premades effects");
  let documents = actor.getEmbeddedCollection("Item").toObject();
  const isMonster = actor.type === "npc";
  const folderName = isMonster ? actor.name : null;
  const data = (await applyChrisPremadeEffects({ documents, compendiumItem: false, force: true, folderName, isMonster }))
    .filter((d) =>
      foundry.utils.getProperty(d, "flags.ddbimporter.chrisEffectsApplied") === true
      && !foundry.utils.hasProperty(d, "flags.items-with-spells-5e.item-spells.parent-item")
    );
  const dataIds = data.map((d) => d._id);
  logger.debug("Chris premades generation complete, beginning replace", {
    isMonster,
    folderName,
    data,
    dataIds,
    actor,
    documents,
  });
  await actor.deleteEmbeddedDocuments("Item", dataIds);
  logger.debug("Chris premades, deletion complete");
  logger.debug("Creating chris premade items", data);
  await actor.createEmbeddedDocuments("Item", data, { keepId: true });
  logger.debug("Delete and recreate complete, beginning restricted item replacer");
  await restrictedItemReplacer(actor, folderName);
  logger.debug("Restricted item replacer complete, beginning Replacement of Redundant Chris Documents");
  await addAndReplaceRedundantChrisDocuments(actor);
  logger.info("Effect replacement complete");
  return data.map((d) => d.name);
}

