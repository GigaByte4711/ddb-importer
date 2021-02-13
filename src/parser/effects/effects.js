import utils from "../../utils.js";
import logger from "../../logger.js";


// I used DAE as a reference
// https://gitlab.com/tposney/dae/-/blob/master/src/module/dae.ts
/**
 *
 * Generate an effect given inputs for AC
 *
 * @param {*} formula
 * @param {*} mode
 * @param {*} itemData
 * @param {*} label
 * @param {*} origin
 */

function armorEffectFromFormula(formula, mode, itemData, label, origin) {
  return {
    label: label,
    icon: itemData.img,
    changes: [
      {
        key: "data.attributes.ac.value",
        value: formula,
        mode,
        priority: 6
      },
    ],
    duration: {
      seconds: null,
      startTime: null,
      rounds: null,
      turns: null,
      startRound: null,
      startTurn: null,
    },
    transfer: true,
    disabled: true,
    origin: origin,
    flags: {dae: {transfer: true, armorEffect: true}, "ddb-importer": {disabled: true}}
  };
}

function generateACBonusEffect(itemData, origin, label, bonus) {
  let ae = armorEffectFromFormula(`${bonus}`, CONST.ACTIVE_EFFECT_MODES.ADD, itemData, label, origin);
  ae.changes.forEach(c => c.priority = 11);
  return ae;
}


/**
 * Generates an AC bonus for an item
 */
export function addACBonusEffect(ddbItem, foundryItem) {
  console.warn(`Item: ${foundryItem.name}`, ddbItem);
  if (!ddbItem.definition?.grantedModifiers) return foundryItem;
  const acBonus = utils.filterModifiers(ddbItem.definition.grantedModifiers, "bonus", "armor-class").reduce((a, b) => a + b.value, 0);
  if (acBonus !== 0) {
    // this item might not have been created yet - we will update these origins later in the character import
    const origin = `ddb.${ddbItem.id}`;
    const label = `${foundryItem.name} AC Bonus`;
    let effect = generateACBonusEffect(foundryItem, origin, label, acBonus);

    if (!ddbItem.definition.canEquip && !ddbItem.definition.canAttune && !ddbItem.definition.isConsumable) {
      // if item just gives a thing and not potion/scroll
      effect.disabled = false;
      setProperty(effect, "flags.ddb-importer.disabled", false);
      setProperty(effect, "flags.dae.alwaysActive", true);
    } else if(
      (ddbItem.isAttuned && ddbItem.equipped) || // if it is attuned and equipped
      (ddbItem.isAttuned && !ddbItem.definition.canEquip) || // if it is attuned but can't equip
      (!ddbItem.definition.canAttune && ddbItem.equipped)) // can't attune but is equipped
    {
      console.log("setting disabled to false")
      setProperty(effect, "flags.ddb-importer.disabled", false);
      effect.disabled = false;
    }

    // set dae flag for active equipped
    if(ddbItem.definition.canEquip || ddbItem.definition.canAttune) {
      setProperty(effect, "flags.dae.activeEquipped", true);
    }

    foundryItem.effects.push(effect);
  }
  console.warn(JSON.parse(JSON.stringify(foundryItem)));
  return foundryItem;
}


// TODO:
// * override ac
// * item effects
// * armour bases
// * natural armors
// * unarmoured effects, like monk


// loop through generated effects and add equipped ones to character
// also need to update any effect images
