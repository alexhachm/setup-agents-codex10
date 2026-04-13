'use strict';

function handleChangeCommand(command, args, { db, handlers = {} }) {
  switch (command) {
    case 'log-change': {
      const changeId = db.createChange(args);
      const change = db.getChange(changeId);
      db.log('coordinator', 'change_logged', { change_id: changeId, description: args.description });
      if (handlers.onChangeCreated) handlers.onChangeCreated(change);
      return { ok: true, change_id: changeId };
    }

    case 'list-changes': {
      const changes = db.listChanges(args || {});
      return { ok: true, changes };
    }

    case 'update-change': {
      const { id: changeId, ...changeFields } = args;
      const allowed = ['enabled', 'status', 'description', 'tooltip'];
      const filtered = {};
      for (const key of allowed) {
        if (changeFields[key] !== undefined) filtered[key] = changeFields[key];
      }
      db.updateChange(changeId, filtered);
      const updated = db.getChange(changeId);
      if (handlers.onChangeUpdated) handlers.onChangeUpdated(updated);
      return { ok: true };
    }

    default:
      throw new Error(`Unknown change command: ${command}`);
  }
}

module.exports = {
  handleChangeCommand,
};
