use clap::{Parser, Subcommand};
use std::path::PathBuf;
use uuid::Uuid;
#[derive(Parser)]
#[command(name = "formsw", version, about = "Structured records, from your terminal.")]
pub(crate) struct Cli {
    #[arg(long, env = "FORM_SERVER", default_value = "http://127.0.0.1:3141", global = true)]
    pub(crate) server: String,
    #[arg(long, global = true)]
    pub(crate) json: bool,
    #[command(subcommand)]
    pub(crate) command: Command,
}
#[derive(Subcommand)]
pub(crate) enum Command {
    /// Authenticate and store a token in the operating system credential store.
    Login {
        #[arg(long, default_value = "owner")]
        username: String,
    },
    Workspace,
    Schema {
        form: String,
    },
    Forms {
        #[command(subcommand)]
        command: FormsCommand,
    },
    Fields {
        #[command(subcommand)]
        command: FieldsCommand,
    },
    Records {
        #[command(subcommand)]
        command: RecordsCommand,
    },
    Attachments {
        #[command(subcommand)]
        command: AttachmentsCommand,
    },
    Import {
        #[command(subcommand)]
        command: ImportCommand,
    },
}
#[derive(Subcommand)]
pub(crate) enum FormsCommand {
    List,
    Show {
        form: String,
    },
    Create {
        #[arg(long)]
        name: String,
        #[arg(long)]
        key: String,
        #[arg(long, default_value = "")]
        description: String,
        #[arg(long)]
        options: bool,
    },
    Update {
        form: String,
        #[arg(long)]
        input: PathBuf,
    },
}
#[derive(Subcommand)]
pub(crate) enum FieldsCommand {
    List {
        form: String,
    },
    Add {
        form: String,
        #[arg(long)]
        input: PathBuf,
    },
    Update {
        field: Uuid,
        #[arg(long)]
        input: PathBuf,
    },
}
#[derive(Subcommand)]
pub(crate) enum RecordsCommand {
    List {
        form: String,
        #[arg(long)]
        search: Option<String>,
        #[arg(long)]
        filter: Option<String>,
        #[arg(long)]
        sort: Option<Uuid>,
        #[arg(long)]
        descending: bool,
        #[arg(long, default_value_t = 50)]
        limit: u32,
        #[arg(long)]
        cursor: Option<u32>,
    },
    Get {
        record: Uuid,
    },
    Add {
        form: String,
        #[arg(long, conflicts_with = "data")]
        input: Option<PathBuf>,
        #[arg(long)]
        data: Option<String>,
    },
    Update {
        record: Uuid,
        #[arg(long)]
        expected_version: i32,
        #[arg(long, conflicts_with = "data")]
        input: Option<PathBuf>,
        #[arg(long)]
        data: Option<String>,
    },
    Archive {
        record: Uuid,
        #[arg(long)]
        expected_version: i32,
    },
}
#[derive(Subcommand)]
pub(crate) enum AttachmentsCommand {
    Upload {
        record: Uuid,
        field: Uuid,
        file: PathBuf,
        #[arg(long)]
        expected_version: i32,
    },
    Download {
        attachment: Uuid,
        #[arg(long)]
        output: PathBuf,
    },
}
#[derive(Subcommand)]
pub(crate) enum ImportCommand {
    /// Preview by default. --commit imports only if every row is valid.
    Csv {
        form: String,
        file: PathBuf,
        #[arg(long)]
        mapping: PathBuf,
        #[arg(long)]
        commit: bool,
    },
}
