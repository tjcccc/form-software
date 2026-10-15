use super::*;
impl Render for Desktop {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let mut root = div()
            .flex()
            .flex_col()
            .size_full()
            .bg(rgb(0xf5f4ef))
            .text_color(rgb(INK))
            .font_family(".AppleSystemUIFont");
        if self.session.is_none() {
            root = root.child(
                div()
                    .flex()
                    .flex_col()
                    .w(px(400.))
                    .m_auto()
                    .p_8()
                    .gap_4()
                    .border_1()
                    .border_color(rgb(LINE))
                    .bg(rgb(0xfaf9f5))
                    .child(
                        div()
                            .text_xs()
                            .font_family("Menlo")
                            .text_color(rgb(MUTED))
                            .child("FORM SOFTWARE / NATIVE"),
                    )
                    .child(div().text_3xl().child("Everything in its own place."))
                    .child(Input::new(&self.server))
                    .child(Input::new(&self.username))
                    .child(Input::new(&self.password))
                    .child(
                        Button::new("login")
                            .primary()
                            .label("Enter workspace")
                            .disabled(self.busy)
                            .on_click(cx.listener(|app, _, window, cx| app.login(window, cx))),
                    ),
            );
        } else {
            let forms = self
                .forms
                .iter()
                .map(|form| {
                    let id = form.id;
                    let selected = self.schema.as_ref().is_some_and(|s| s.form.id == id);
                    div()
                        .id(SharedString::from(format!("form-{id}")))
                        .px_4()
                        .py_3()
                        .cursor_pointer()
                        .bg(rgb(if selected { 0xe4e5da } else { 0xefeee7 }))
                        .text_sm()
                        .child(form.name.clone())
                        .on_click(cx.listener(move |app, _, window, cx| {
                            if !app.busy && !app.dirty(cx) {
                                app.load(id, window, cx);
                            } else {
                                app.status =
                                    "Close or save the record before changing forms.".into();
                                cx.notify();
                            }
                        }))
                })
                .collect::<Vec<_>>();
            let mut body = div().flex().flex_1().min_h_0().child(
                div()
                    .flex()
                    .flex_col()
                    .w(px(220.))
                    .flex_shrink_0()
                    .border_r_1()
                    .border_color(rgb(LINE))
                    .bg(rgb(0xefeee7))
                    .p_4()
                    .gap_2()
                    .child(div().py_6().text_lg().child("FORM SOFTWARE_"))
                    .child(
                        div()
                            .py_3()
                            .text_xs()
                            .font_family("Menlo")
                            .text_color(rgb(MUTED))
                            .child("PERSONAL WORKSPACE"),
                    )
                    .children(forms),
            );
            let mut content = div().flex().flex_col().flex_1().min_w_0().p_8().gap_5();
            if let Some(schema) = &self.schema {
                let form_id = schema.form.id;
                content = content.child(
                    div()
                        .flex()
                        .justify_between()
                        .items_center()
                        .child(
                            div()
                                .flex()
                                .flex_col()
                                .gap_2()
                                .child(div().text_3xl().child(format!("{}.", schema.form.name)))
                                .child(
                                    div()
                                        .text_sm()
                                        .text_color(rgb(MUTED))
                                        .child(schema.form.description.clone()),
                                ),
                        )
                        .child(
                            div()
                                .flex()
                                .gap_2()
                                .child(
                                    Button::new("refresh")
                                        .label("Refresh")
                                        .disabled(self.busy || self.editing.is_some())
                                        .on_click(cx.listener(move |app, _, window, cx| {
                                            app.load(form_id, window, cx)
                                        })),
                                )
                                .child(
                                    Button::new("new")
                                        .primary()
                                        .label("+ New record")
                                        .disabled(self.busy || self.editing.is_some())
                                        .on_click(cx.listener(|app, _, window, cx| {
                                            app.inspect(None, window, cx)
                                        })),
                                ),
                        ),
                );
                let rows = self
                    .records
                    .iter()
                    .enumerate()
                    .map(|(index, record)| {
                        let record = record.clone();
                        let title = record_title(&record, schema);
                        let version = record.version;
                        div()
                            .id(SharedString::from(format!("record-{}", record.id)))
                            .flex()
                            .gap_5()
                            .items_center()
                            .px_4()
                            .py_3()
                            .border_b_1()
                            .border_color(rgb(0xe8e8df))
                            .cursor_pointer()
                            .hover(|style| style.bg(rgb(0xeff1e7)))
                            .child(
                                div()
                                    .w(px(26.))
                                    .text_xs()
                                    .font_family("Menlo")
                                    .text_color(rgb(MUTED))
                                    .child(format!("{:02}", index + 1)),
                            )
                            .child(div().flex_1().text_sm().child(title))
                            .child(
                                div()
                                    .text_xs()
                                    .font_family("Menlo")
                                    .text_color(rgb(MUTED))
                                    .child(format!("v{version}")),
                            )
                            .on_click(cx.listener(move |app, _, window, cx| {
                                if !app.busy {
                                    app.inspect(Some(record.clone()), window, cx);
                                }
                            }))
                    })
                    .collect::<Vec<_>>();
                content = content.child(
                    div()
                        .id("records")
                        .flex_1()
                        .min_h_0()
                        .overflow_y_scroll()
                        .border_1()
                        .border_color(rgb(LINE))
                        .bg(rgb(0xfaf9f5))
                        .children(rows),
                );
            }
            body = body.child(content);
            if self.editing.is_some() {
                let fields = self
                    .editors
                    .iter()
                    .map(|editor| {
                        div()
                            .flex()
                            .flex_col()
                            .gap_2()
                            .child(div().text_xs().text_color(rgb(MUTED)).child(format!(
                                "{}{}",
                                editor.field.name,
                                if editor.field.required { " *" } else { "" }
                            )))
                            .child(Input::new(&editor.input))
                    })
                    .collect::<Vec<_>>();
                body = body.child(
                    div()
                        .flex()
                        .flex_col()
                        .w(px(360.))
                        .border_l_1()
                        .border_color(rgb(LINE))
                        .bg(rgb(0xfaf9f5))
                        .p_6()
                        .gap_5()
                        .child(
                            div()
                                .flex()
                                .justify_between()
                                .items_center()
                                .child("RECORD INSPECTOR")
                                .child(
                                    Button::new("close")
                                        .ghost()
                                        .label("Close")
                                        .disabled(self.busy)
                                        .on_click(cx.listener(|app, _, window, cx| {
                                            app.close_inspector(window, cx)
                                        })),
                                ),
                        )
                        .child(
                            div()
                                .text_xs()
                                .text_color(rgb(MUTED))
                                .child("Dates use YYYY-MM-DD; duration uses minutes."),
                        )
                        .child(
                            div()
                                .id("edit-fields")
                                .flex()
                                .flex_col()
                                .gap_4()
                                .flex_1()
                                .min_h_0()
                                .overflow_y_scroll()
                                .children(fields),
                        )
                        .child(
                            Button::new("save")
                                .primary()
                                .label(if self.busy {
                                    "Saving…"
                                } else {
                                    "Save record"
                                })
                                .disabled(self.busy)
                                .on_click(cx.listener(|app, _, window, cx| app.save(window, cx))),
                        ),
                );
            }
            root = root.child(body);
        }
        root.child(
            div()
                .border_t_1()
                .border_color(rgb(LINE))
                .px_5()
                .py_3()
                .text_xs()
                .font_family("Menlo")
                .text_color(rgb(MUTED))
                .child(self.status.clone()),
        )
    }
}
