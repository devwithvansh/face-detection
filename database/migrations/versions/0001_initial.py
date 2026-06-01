"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-06-01
"""
from alembic import op
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "personnel",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("army_id", sa.String(length=64), nullable=False, unique=True),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("rank", sa.String(length=128), nullable=False),
        sa.Column("battalion", sa.String(length=128), nullable=False),
        sa.Column("unit", sa.String(length=128), nullable=False),
        sa.Column("profile_photo", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_personnel_army_id", "personnel", ["army_id"])

    op.create_table(
        "face_embeddings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("personnel_id", sa.Integer(), sa.ForeignKey("personnel.id", ondelete="CASCADE"), nullable=False),
        sa.Column("embedding_vector", sa.LargeBinary(length=4096), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "attendance_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("personnel_id", sa.Integer(), sa.ForeignKey("personnel.id"), nullable=False),
        sa.Column("camera_id", sa.String(length=128), nullable=False),
        sa.Column("entry_time", sa.DateTime(timezone=True), nullable=True),
        sa.Column("exit_time", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("confidence_score", sa.Float(), nullable=True),
    )
    op.create_index("ix_attendance_logs_personnel_id", "attendance_logs", ["personnel_id"])
    op.create_index("ix_attendance_logs_camera_id", "attendance_logs", ["camera_id"])

    op.create_table(
        "unknown_faces",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("image_path", sa.Text(), nullable=False),
        sa.Column("detected_time", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("reviewed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("registered_personnel_id", sa.Integer(), sa.ForeignKey("personnel.id"), nullable=True),
    )
    op.create_index("ix_unknown_faces_detected_time", "unknown_faces", ["detected_time"])

    op.create_table(
        "active_presence",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("personnel_id", sa.Integer(), sa.ForeignKey("personnel.id"), nullable=False, unique=True),
        sa.Column("currently_inside", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("last_seen", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("active_presence")
    op.drop_index("ix_unknown_faces_detected_time", table_name="unknown_faces")
    op.drop_table("unknown_faces")
    op.drop_index("ix_attendance_logs_camera_id", table_name="attendance_logs")
    op.drop_index("ix_attendance_logs_personnel_id", table_name="attendance_logs")
    op.drop_table("attendance_logs")
    op.drop_table("face_embeddings")
    op.drop_index("ix_personnel_army_id", table_name="personnel")
    op.drop_table("personnel")
