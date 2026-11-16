export {
  type CaretBookmark,
  type ClipboardRangePayload,
  MD_ACTIVE_ATTR,
  MD_HR_ACTIVE_ATTR,
  MD_HR_SYNTAX_ATTR,
  MD_SYNTAX_ATTR,
  MD_URL_ATTR,
  NOTE_IMAGE_BLOCK_ATTR,
  NOTE_IMAGE_TAIL_ATTR,
  extractRangeClipboardPayload,
  getCaretBookmark,
  getClosestBlock,
  getTopLevelBlock,
  hasVisibleContent,
  isInsideMarkdownSyntax,
  isInsideTag,
  normalizeEmptyEditorOnMount,
  placeCaret,
  placeCaretAtEnd,
  placeCaretAtStart,
  resolveFocusTarget,
  restoreCaretBookmark,
  sanitizeClipboardHtml,
  sanitizeHttpUrl,
  sanitizeStoredNoteHtml,
  stripChromiumInlineArtifacts,
  stripLiveSyntaxArtifacts,
} from "./markdown/note-dom";

export { createTaskListItem, toggleTaskCheckboxElement } from "./markdown/note-specs";

export {
  applyMarkdownOnBackspace,
  applyMarkdownOnDelete,
  applyMarkdownOnEnter,
  applyMarkdownOnSpace,
  applyMarkdownOnTab,
  toggleTaskListCommand,
} from "./markdown/note-blocks";

export {
  applyInlineMarkdownAtCaret,
  exitInlineMarkOnClick,
  handleMarkdownDelimiterBackspace,
  handleMarkdownDelimiterKeyDown,
  resolveInlineBoundaryOnArrow,
  stripSyntaxBeforeExecCommand,
  toggleInlineWrapperCommand,
  unwrapEmptyInlinePairOnSpace,
  wrapSelectionAsLink,
  wrapSelectionWithDelimiter,
} from "./markdown/note-inline";

export {
  activateHorizontalRuleAtClient,
  clearAllLiveMarkdownSyntax,
  expandHorizontalRuleAndFocus,
  findHorizontalRuleAtClientY,
  findPrefixBlockInGutter,
  reconcileActiveMarkdownSyntax,
  resolveArrowIntoHorizontalRule,
  resolveBlockPrefixOnArrow,
  syncLiveMarkdownSyntax,
} from "./markdown/note-live-preview";

export {
  createImageAtomBlock,
  isImageBlockElement,
  moveCaretOutOfImageBlock,
  normalizeEditorImageBlocks,
  placeCaretInEditableBlockAtY,
  resolveArrowIntoImageBlock,
  resolveImageBoundaryBeforeBackspace,
  resolveImageBoundaryBeforeDelete,
  syncImageTailParagraphs,
} from "./markdown/note-images";

export { noteHtmlToMarkdown } from "./markdown/note-export";
