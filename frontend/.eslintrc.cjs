module.exports = {
  rules: {
    "no-restricted-syntax": [
      "error",
      {
        selector: "MemberExpression[object.object.name='import'][object.property.name='meta']",
        message: "Do not use import.meta.env outside utils/api.ts"
      }
    ]
  },
  overrides: [
    {
      files: ["src/utils/api.ts"],
      rules: {
        "no-restricted-syntax": "off"
      }
    }
  ]
};