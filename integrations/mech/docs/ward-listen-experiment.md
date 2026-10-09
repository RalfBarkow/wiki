# Ward's temporary LISTEN experiment: separate author-supplied evidence

After the maintained-composition plan, the user supplied Ward's screenshot excerpt:

```js
if (body) {
  state.title = data.title || 'unknown'
  run(body, state, 'listen')
}
```

Ward described this as a temporary experiment developed with Paul, not the intended final implementation. He explained that the optional third argument to `run` is a recent addition related to CODE authorization for non-owner users.

Evidence status: author-reported experimental code, supplied in this conversation. The screenshot's repository authority, complete surrounding source, revision, installation and message-validation rules are not established. It is not evidence that the pinned upstream revision implements this behavior, or that a current production runtime has it.

The independently inspected upstream pin is WardCunningham/wiki-plugin-mech `a028b4bba04e539dcaa090423d38a00a0050489d`. Its `code_emit` guard is:

```js
initiator || (window.isOwner && !pageObject.isRemote())
```

Its `run` dispatcher passes `initiator` to the selected emitter. The trusted browser test demonstrates acceptance of a truthy internal initiator, not only literal `click` or `tick` strings. The screenshot supplies the truthy value `listen`; consequently a nested CODE invocation would satisfy that tested guard **if** it reached the tested dispatcher unchanged in a combined implementation.

That conditional consequence is a source-level inference, not an established exploit or verified current upstream behavior. Message trust, origin/source validation, listener activation, nested initiator propagation and page-code trust need a separate investigation before deployment. No screenshot behavior, event-to-state forwarding or LISTEN change is included in this module. The pinned LISTEN emitter remains upstream-owned and unchanged.
