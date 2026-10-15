mod workspace;
use gpui::{
    App, AppContext, Application, Bounds, TitlebarOptions, WindowBounds, WindowOptions, px, rgb,
    size,
};
use gpui_component::{Root, Theme, ThemeMode};
fn main() {
    Application::new().run(|cx: &mut App| {
        gpui_component::init(cx);
        Theme::change(ThemeMode::Light, None, cx);
        let theme = Theme::global_mut(cx);
        theme.radius = px(0.);
        theme.radius_lg = px(0.);
        theme.shadow = false;
        theme.font_size = px(13.);
        theme.colors.background = rgb(0xfaf9f5).into();
        theme.colors.foreground = rgb(0x292c29).into();
        theme.colors.primary = rgb(0xba472d).into();
        theme.colors.primary_hover = rgb(0xa73d25).into();
        theme.colors.primary_foreground = rgb(0xfffaf1).into();
        theme.colors.border = rgb(0xd8d9cf).into();
        theme.colors.input = rgb(0xd8d9cf).into();
        theme.colors.caret = rgb(0xba472d).into();
        let bounds = Bounds::centered(None, size(px(1180.), px(780.)), cx);
        let result = cx.open_window(
            WindowOptions {
                window_bounds: Some(WindowBounds::Windowed(bounds)),
                titlebar: Some(TitlebarOptions {
                    title: Some("FormSoftware".into()),
                    ..Default::default()
                }),
                ..Default::default()
            },
            |window, cx| {
                let app = cx.new(|cx| workspace::Desktop::new(window, cx));
                cx.new(|cx| Root::new(app, window, cx))
            },
        );
        if let Err(error) = result {
            eprintln!("Could not open FormSoftware: {error}");
            cx.quit();
        }
        cx.on_window_closed(|cx| {
            if cx.windows().is_empty() {
                cx.quit();
            }
        })
        .detach();
        cx.activate(true);
    });
}
