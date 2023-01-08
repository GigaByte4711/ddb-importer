import logger from "../../logger.js";
import DDBCharacter from "../DDBCharacter.js";
import DDBCompanionFactory from "./DDBCompanionFactory.js";

// DDBCharacter.prototype.addCompanionsToDocument = function(document, companions) {

//   return document;
// };

DDBCharacter.prototype.getClassFeature = function(name) {
  const klass = this.source.ddb.character.classes
    .find((k) => k.classFeatures.some((f) => f.definition.name == name));
  return klass?.classFeatures?.find((f) => f.definition.name == name);
};


DDBCharacter.prototype._findDDBSpell = function(name) {
  const spells = [];
  this.source.ddb.character.classSpells.forEach((playerClass) => {
    spells.push(...playerClass.spells);
  });

  const klassSpell = spells.find((s) => s.definition?.name === name);
  if (klassSpell) return klassSpell;

  // Parse any spells granted by class features, such as Barbarian Totem
  const extraKlass = this.source.ddb.character.spells.class.find((s) => s.definition?.name === name);
  if (extraKlass) return extraKlass;

  // Race spells are handled slightly differently
  const race = this.source.ddb.character.spells.race.find((s) => s.definition?.name === name);
  if (race) return race;

  // feat spells are handled slightly differently
  const feat = this.source.ddb.character.spells.feat.find((s) => s.definition?.name === name);
  if (feat) return feat;

  // background spells are handled slightly differently
  if (!this.source.ddbdb.character.spells.background) this.source.ddb.character.spells.background = [];
  const background = this.source.ddb.character.spells.background.find((s) => s.definition?.name === name);
  if (background) return background;

  return undefined;
};

DDBCharacter.prototype._parseCompanion = async function(html, type) {
  const ddbCompanionFactory = new DDBCompanionFactory(this, html, { type });
  await ddbCompanionFactory.parse();
  this.companionFactories.push(ddbCompanionFactory);
};

DDBCharacter.prototype._importCompanions = async function() {
  for (const factory of this.companionFactories) {
    // eslint-disable-next-line no-await-in-loop
    await factory.updateOrCreateCompanions();
  }
};

DDBCharacter.prototype._getCompanionSpell = async function(name) {
  const spell = this.data.spells.find((s) => s.name === name || s.flags.ddbimporter?.originalName === name);
  if (!spell) return;
  const ddbSpell = this._findDDBSpell(spell.flags.ddbimporter?.originalName ?? spell.name);
  if (!ddbSpell) return;
  await this._parseCompanion(ddbSpell.definition.description, "spell");
};

DDBCharacter.prototype._getCompanionFeature = async function(featureName) {
  const feature = this.data.features.concat(this.data.actions).find((s) =>
    s.name === featureName || s.flags.ddbimporter?.originalName === featureName
  );
  if (!feature) return;
  const ddbFeature = this.getClassFeature(featureName);
  if (!ddbFeature) return;
  await this._parseCompanion(ddbFeature.definition.description, "feature");
};

DDBCharacter.prototype.generateCompanions = async function() {
  if (!game.modules.get("arbron-summoner")?.active) {
    logger.warn("Companion Parsing requires the Arbron Summoner module");
    return;
  }
  const companionSpells = [
    "Summon Aberration",
    "Summon Beast",
    "Summon Celestial",
    "Summon Construct",
    "Summon Elemental",
    "Summon Fey",
    "Summon Fiend",
    "Summon Shadowspawn",
    "Summon Undead",
    "Summon Draconic Spirit",
  ];
  const companionFeatures = [
    "Steel Defender",
    "Artificer Infusions",
    "Summon Wildfire Spirit",
    "Primal Companion",
  ];
  for (const name of companionFeatures) {
    // eslint-disable-next-line no-await-in-loop
    await this._getCompanionFeature(name);
  }
  for (const name of companionSpells) {
    // eslint-disable-next-line no-await-in-loop
    await this._getCompanionSpell(name);
  }

  console.warn(this.companionFactories);
  await this._importCompanions();

  this.companions = this.companionFactories.map((factory) => factory.companions);

  logger.debug("parsed companions", {
    factories: this.companionFactories,
    parsed: this.companions,
  });
  // different types of companion
  // ranger beast companions, classic and new
  // ranger drake warden
  // ranger other?
  // artificer steel defender
  // artificer homunculus
  // new summon spells
  // classic summons (not handled here)
  // druid circle of fire companion

};

