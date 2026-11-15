declare module "nspell" {
  export interface NSpellInstance {
    correct(word: string): boolean;
    suggest(word: string): string[];
    spell(word: string): {
      correct: boolean;
      forbidden: boolean;
      warn: boolean;
    };
    add(word: string, model?: string): this;
    remove(word: string): this;
    dictionary(dic: string): this;
    personal(dic: string): this;
  }

  function nspell(aff: string, dic?: string): NSpellInstance;
  function nspell(dictionary: { aff: string; dic?: string }): NSpellInstance;
  export default nspell;
}
