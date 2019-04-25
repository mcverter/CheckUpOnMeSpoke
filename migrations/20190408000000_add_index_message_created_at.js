// Add index on message.created_at
exports.up = function(knex, Promise) {
  return knex.schema.alterTable('message', table => {
    table.index('created_at')
  })
}

// Drop index on message.created_at
exports.down = function(knex, Promise) {
  return knex.schema.alterTable('message', table => {
    table.dropIndex('created_at')
  })
}
