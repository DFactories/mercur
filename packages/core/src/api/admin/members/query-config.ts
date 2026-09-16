export const adminMemberListQueryConfig = {
  list: {
    // `phone` is the vendor panel's sign-in credential and the only identity a
    // phone-native member has — `email` is null for every OTP sign-up. Leaving
    // it out of the defaults made "add an existing member to this store"
    // unreachable: the admin team form searches by phone, then matches on
    // `m.phone`, which the API never returned, so every lookup missed and the
    // form silently fell through to sending a fresh invite instead.
    //
    // `first_name` / `last_name` are here for the same reason at the display
    // level: an operator picking between two members needs a name, and a row
    // that can only show an id is not a choice anyone can make.
    defaults: [
      "id",
      "email",
      "phone",
      "first_name",
      "last_name",
      "is_active",
      "created_at",
    ],
    defaultLimit: 10,
    isList: true,
  },
}
