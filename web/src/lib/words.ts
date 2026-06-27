// Shared, human-memorizable word pools for device names and room codes.
// Short & pronounceable; broad enough to avoid collisions (~80 x ~80).

export const ADJECTIVES = [
  "swift", "calm", "bright", "brave", "clever", "quiet", "lucky", "merry",
  "nimble", "bold", "cosmic", "sunny", "fuzzy", "spry", "keen", "jolly",
  "amber", "azure", "crimson", "golden", "ivory", "jade", "scarlet", "teal",
  "violet", "coral", "olive", "rusty", "silver", "cobalt", "lush", "misty",
  "frosty", "stormy", "breezy", "dusky", "dawn", "noble", "gentle", "fierce",
  "loyal", "witty", "snappy", "zippy", "plucky", "chipper", "dapper", "feisty",
  "mellow", "vivid", "lively", "cheery", "wise", "quick", "sleek", "groovy",
  "happy", "epic", "fluffy", "cozy", "sparky", "perky", "zesty", "robust",
  "humble", "ancient", "modern", "hidden", "shiny", "wild", "polar", "tropic",
  "lunar", "solar", "stellar", "rapid", "mighty", "tiny", "grand", "royal",
];

export const ANIMALS = [
  "otter", "koala", "falcon", "panda", "lynx", "heron", "tapir", "gecko",
  "marten", "ibis", "yak", "wombat", "puffin", "civet", "quokka", "narwhal",
  "badger", "beaver", "bison", "cobra", "crane", "dingo", "eagle", "ferret",
  "finch", "gibbon", "hawk", "raven", "jaguar", "kestrel", "lemur", "llama",
  "manta", "meerkat", "mole", "moose", "newt", "ocelot", "osprey", "panther",
  "robin", "seal", "shrew", "stoat", "swan", "tiger", "toucan", "vulture",
  "walrus", "weasel", "wolf", "zebra", "alpaca", "bat", "boar", "camel",
  "cheetah", "dolphin", "egret", "fox", "gull", "hare", "ibex", "koi",
  "kiwi", "loon", "lark", "mink", "moth", "orca", "owl", "pika",
  "quail", "rhino", "skink", "sloth", "tern", "viper", "wren", "mantis",
];

export const pickWord = <T>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
