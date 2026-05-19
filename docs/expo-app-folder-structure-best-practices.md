# How to organize Expo app folder structure for clarity and scalability

Development • React Native • September 23, 2025 • 9 minutes read  
Kadi Kraman

Organize your Expo Router project with proven folder structures for components, screens, API routes, and more to scale React Native apps.

Properly organized folder structure has a great impact on productivity. Just like a tidy office sets you up to do your best work, so does a tidy codebase with every file in its place. This is not just helpful for human developers - if you are using AI to speed up your work, a solid plan increases its chances of generating the right code. Also, if you and AI follow the same plan, it makes it much easier to find that code later.

In an Expo Router codebase, we have file-based routing, platform-specific code, styling, server code, and regular React components. In this blog, we discuss some tried and tested strategies for organizing all of these for an app that scales.

## Use a `/src` folder

Expo Router is a file-based router where the navigation tree of your app is based on the folder structure and layout files, with the main entry point being the `/app` folder. Both `/app` and `/src/app` are supported out of the box. So if you want to switch from `/app` to `/src/app`, simply move the folder and restart the bundler.

The benefit of using `/src` folder is that it allows you to separate your app code from other files, and this makes the codebase much easier to work with.

Example using the `/app` folder at the root level:

```text
├── app/
├── assets/
├── components/
├── scripts/
├── hooks/
├── constants.ts
├── theme.ts
├── app.json
├── eas.json
└── package.json
```

Versus using `/src/app`:

```text
├── assets/
├── scripts/
├── src/
│   ├── app/
│   ├── components/
│   ├── hooks/
│   ├── constants.ts
│   └── theme.ts
├── app.json
├── eas.json
└── package.json
```

In the second example, it is much easier to distinguish between application code and other config files.

## Create a reusable components folder

With file-based routing we are limited on what files we can add to our `/app` folder since every file will create a new route. A common pattern for all React projects is to have a `/components` folder for reusable components: buttons, sliders, cards, etc.

Each component will generally have one named export. Regarding the filename there are two schools of thought:

- **Classic**: the filename is exactly the same as the component name (including the capitalized first letter).
- **Modern**: the filename is a kebab-case version of the component name, e.g. `MyComponent` becomes `my-component`.

Choose one based on your preference; both are valid and consistency matters.

`src/components/button.tsx`

```tsx
export function Button() {
  ...
}
```

For components that could do with breaking out into separate files, it is common to create a folder with the component name, and add the main component in the index file. This way other smaller components which are not needed anywhere else can be colocated.

`src/components/table/index.tsx`

```tsx
import { Row } from "./row";
import { Cell } from "./cell";

export function Table() {
  ...
}
```

Using an index file here is a useful convention, because the import path of the component stays unchanged from when the component was just a single file, and you can instantly tell which file is the root component.

Putting these two examples together, the folder structure becomes:

```text
└── src/
    ├── app/
    │   ├── index.tsx
    │   └── _layout.tsx
    └── components/
        ├── table/
        │   ├── components/
        │   │   ├── row.tsx
        │   │   └── cell.tsx
        │   └── index.tsx
        └── button.tsx
```

## Consider a `/screens` folder

Notice how in the components example above, we created a folder for the `Table` component so we could break it down further into smaller, more manageable components. As your app grows, you might find it useful to do the same for your app screens, especially when there is a lot of UI code that is complex, but not used in other pages (so it does not make sense to place it in the components folder). Trouble is, since every file in the `/app` folder creates a route, it is not possible to create extra components there.

For small apps, this is not usually a problem, but as your app grows, you will feel the need for some separation. So, a solution that large codebases often adopt is to create a `/screens` folder, with every route simply returning a screen component.

`src/app/index.tsx`

```tsx
import { Home } from "@screens/home";

export default function HomeScreen() {
  // Handle any context-specific code in the route, e.g. getting URL params
  return <Home />;
}
```

This way the screen could be made up of multiple components and broken down into multiple files if needed:

```text
└── src/
    ├── app/
    │   ├── index.tsx
    │   ├── settings.tsx
    │   └── _layout.tsx
    └── screens/
        ├── home/
        │   ├── components/
        │   │   └── timeline.tsx
        │   └── index.tsx
        └── settings.tsx
```

A side bonus of this approach is that it makes it extremely easy to render the same screen in multiple routes. Shared routes are always an option, but in some cases just rendering the same screen as a component is simpler and more readable.

## Utilities and hooks

Is there a box, a cupboard, or perhaps a drawer in your house where miscellaneous items go that would not otherwise have a home? Most codebases have something similar, and we call it the `utils` folder.

> "I use the KonMari method for code organization.
> Does this code spark joy?
> YES -> /src
> NO -> /util"

Jokes aside, this is a place for small standalone utilities such as date formatters, currency converters, data transformers, etc.

In a React (Native) codebase you will also find yourself writing reusable hooks quite often, so it is very common to have a folder for hooks too.

```text
└── src/
    ├── utils/
    │   ├── format-date.ts
    │   └── pluralize.ts
    └── hooks/
        ├── use-app-state.ts
        └── use-theme.ts
```

## Separate server code

With Expo Router API routes, we are able to write server code directly in the React Native codebase. Simply appending `+api` to a file in the `/app` folder will turn it into an API route, meaning you can deploy it on its own or as part of the web export of your app.

The API code gets executed on the server-side environment, meaning that you can use sensitive environment variables (in particular, any `process.env.MY_VAL` can be used, compared to the rest of the codebase where only environment variables prefixed with `EXPO_PUBLIC_` will be inlined). There is also a difference in runtime since the frontend code executes either in the browser or on device, versus the API code when deployed with EAS Hosting in a Node.js-like environment.

All this is to say, as your application grows and you want to reuse logic between API routes, or extract parts of the code to a separate codebase, separating the server code will be very useful.

While API routes can be anywhere in the `/app` folder, I like to place them all in a single `/api` folder, making the actual routes like `/api/user` and `/api/settings`. This not only allows us to group the API routes and colocate them, but is also a sensible precaution against route collisions, e.g. if you happen to have both a screen and an API route for `/user`.

Furthermore, any utilities for the API routes could be extracted to a `/server` folder to indicate special rules.

```text
└── src/
    ├── app/
    │   ├── api/
    │   │   ├── user+api.ts
    │   │   └── settings+api.ts
    │   └── index.tsx
    └── server/
        ├── auth.ts
        └── db.ts
```

You may also want to consider adding custom ESLint rules to `+api` files and everything in the `/server` folder, or conversely, exclude those locations from checks that assume the code runs in the frontend environment.

## Platform-specific code

When building for multiple targets, it is sometimes necessary to add platform-specific code. While smaller differences can be handled with `Platform.select` or checking `Platform.OS`, many such statements can put you in danger of spaghetti code. It is often cleaner to encapsulate larger changes in separate files using platform-specific file extensions.

Say you had a `BarChart` component that had completely separate implementations on web and native, including relying on different charting libraries. Then you can create two components: `bar-chart.tsx` and `bar-chart.web.tsx`. In your codebase, import it as if the extra file extension did not exist:

```ts
import { BarChart } from "@components/bar-chart";
```

When Metro bundles the JavaScript code, it will automatically pick the web file when it is bundling for the web.

Note that:

- the props for `BarChart` should be identical for both components.
- a default version of the component without a platform-specific extension is always required (if you wanted to create a component only for one platform, you can make the default component a no-op).
- the following extensions are supported: `.web`, `.native`, `.ios`, `.android`.

## Colocate your styles

When using `StyleSheet`, inline styles, or Unistyles for styling, you may want to pull your styles out to a separate file like this:

```text
└── src/
    └── components/
        ├── button.tsx
        └── button.styles.tsx
```

While this was fashionable for a while, the modern approach is to keep your style object at the bottom of your component file as it makes the styles easier to see and work with:

`src/components/button.tsx`

```tsx
export function Button() {
  return ...;
}

const styles = StyleSheet.create({
  ...
});
```

## Colocate your unit tests

There are two schools of thought when it comes to unit tests:

1. Create a separate `tests` folder.
2. Colocate the tests with the file being tested.

Both are valid, so it comes down to preference. I prefer colocating the tests so you can easily see at a glance which files are tested.

```text
└── src/
    └── utils/
        ├── format-date.ts
        └── format-date.test.ts
```

## Summary

With only a few rules, your codebase becomes much more manageable at scale. When we put all the rules above together, we get something like this:

```text
├── assets/
├── scripts/
├── src/
│   ├── app/
│   │   ├── api/                    # API routes in a separate folder
│   │   │   ├── event+api.ts
│   │   │   └── user+api.ts
│   │   ├── _layout.tsx
│   │   ├── _layout.web.tsx         # separate layout file for web
│   │   ├── index.tsx
│   │   ├── events.tsx
│   │   └── settings.tsx
│   ├── components/
│   │   ├── table/
│   │   │   ├── cell.tsx
│   │   │   └── index.tsx
│   │   ├── bar-chart.tsx
│   │   ├── bar-chart.web.tsx       # separate components for web and native
│   │   └── button.tsx
│   ├── screens/
│   │   ├── home/
│   │   │   ├── card.tsx            # component only used in the home page
│   │   │   └── index.tsx           # returned from /src/app/index.tsx
│   │   ├── events.tsx              # returned from /src/app/events.tsx
│   │   └── settings.tsx            # returned from /src/app/settings.tsx
│   ├── server/                     # code used in /api
│   │   ├── auth.ts
│   │   └── db.ts
│   ├── utils/                      # reusable utilities
│   │   ├── format-date.ts
│   │   ├── format-date.test.ts     # unit test next to the file being tested
│   │   └── pluralize.ts
│   └── hooks/
│       ├── use-app-state.ts
│       └── use-theme.ts
├── app.json
├── eas.json
└── package.json
```

## Changelog

January 7, 2026: Updated the default recommendation to use kebab-case filenames. This is consistent with the SDK 55 default template.
