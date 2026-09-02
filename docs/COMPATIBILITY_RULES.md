# Compatibility rules

clisemver recommends the smallest Semantic Versioning bump that accounts for every
detected public CLI change. The rules favor avoiding false negatives: a behavioral
change such as a new default is considered breaking even when some users may be
unaffected.

## Major changes

These can invalidate an existing invocation:

- Removing a command.
- Changing the root command name.
- Removing an option or any accepted option alias.
- Adding an option marked as required.
- Making an optional option required.
- Adding or removing a value from an existing option.
- Making an optional option value required.
- Changing value arity between scalar and variadic.
- Changing or removing an option default.
- Removing a previously accepted choice.
- Removing a positional.
- Adding a required positional.
- Making an optional positional required.
- Changing positional arity.

## Minor changes

These extend or relax the interface:

- Adding a command.
- Adding an optional option or alias.
- Adding an accepted choice.
- Making a required option optional.
- Making a required option value optional.
- Adding an optional positional.
- Making a required positional optional.

## Patch changes

These alter documentation without changing how arguments are accepted:

- Changing a command description.
- Changing an option value placeholder such as `<file>` to `<path>`.
- Changing a positional label while preserving order and requirements.
- Changing the preferred option spelling while preserving every old alias.

## Not currently compared

Version text, raw usage formatting, option descriptions, whitespace, ANSI styling,
and command ordering do not affect the recommendation. Exit behavior and structured
command output are planned extensions because they require explicit probes rather
than safe help discovery.
