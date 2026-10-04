package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"runtime/debug"
	"syscall/js"
	"time"

	"github.com/tintoser/mppgo/mpp"
	"github.com/tintoser/mppgo/project"
)

type duration struct {
	Amount float64 `json:"amount"`
	Unit   string  `json:"unit"`
}
type dependency struct {
	ID   int      `json:"id"`
	Type string   `json:"type"`
	Lag  duration `json:"lag"`
}
type task struct {
	ID             int          `json:"id"`
	UID            int          `json:"uid"`
	Name           string       `json:"name"`
	WBS            string       `json:"wbs"`
	Level          int          `json:"level"`
	Start          *string      `json:"start"`
	Finish         *string      `json:"finish"`
	Duration       duration     `json:"duration"`
	Complete       float64      `json:"complete"`
	Summary        bool         `json:"summary"`
	Milestone      bool         `json:"milestone"`
	Inactive       bool         `json:"inactive"`
	BaselineStart  *string      `json:"baselineStart"`
	BaselineFinish *string      `json:"baselineFinish"`
	Predecessors   []dependency `json:"predecessors"`
	Resources      []string     `json:"resources"`
	Notes          string       `json:"notes"`
}
type resource struct {
	ID       int     `json:"id"`
	Name     string  `json:"name"`
	Group    string  `json:"group"`
	Type     string  `json:"type"`
	MaxUnits float64 `json:"maxUnits"`
	Notes    string  `json:"notes"`
}
type document struct {
	Name      string     `json:"name"`
	Tasks     []task     `json:"tasks"`
	Resources []resource `json:"resources"`
}

func date(t time.Time) *string {
	if t.IsZero() {
		return nil
	}
	s := t.Format("2006-01-02T15:04:05")
	return &s
}
func dur(d project.Duration) duration { return duration{d.Amount, d.Units.String()} }
func fail(code string) string         { return `{"error":"` + code + `"}` }
func parse(_ js.Value, args []js.Value) (result interface{}) {
	defer func() {
		if recover() != nil {
			result = fail("invalid-file")
		}
	}()
	if len(args) != 1 {
		return fail("invalid-file")
	}
	size := args[0].Get("byteLength").Int()
	if size > 128*1024*1024 {
		return fail("resource-limit")
	}
	input := make([]byte, size)
	js.CopyBytesToGo(input, args[0])
	pf, err := mpp.Read(bytes.NewReader(input))
	if errors.Is(err, mpp.ErrPasswordProtected) {
		return fail("password-required")
	}
	if errors.Is(err, mpp.ErrUnsupportedFormat) {
		return fail("unsupported-format")
	}
	if err != nil {
		return fail("invalid-file")
	}
	if len(pf.Tasks) > 100000 || len(pf.Resources) > 100000 || len(pf.Assignments) > 200000 {
		return fail("resource-limit")
	}
	names := make(map[int][]string)
	for _, a := range pf.Assignments {
		if r := pf.ResourceByID(a.ResourceUniqueID); r != nil {
			names[a.TaskUniqueID] = append(names[a.TaskUniqueID], r.Name)
		}
	}
	doc := document{Name: pf.Properties.Name, Tasks: make([]task, 0, len(pf.Tasks)), Resources: make([]resource, 0, len(pf.Resources))}
	for _, t := range pf.Tasks {
		start, finish := t.Start, t.Finish
		// Summary dates are stored as early dates, not as current leaf dates.
		if t.Summary && !t.Inactive {
			start, finish = t.EarlyStart, t.EarlyFinish
		}
		row := task{ID: t.ID, UID: t.UniqueID, Name: t.Name, WBS: t.WBS, Level: t.OutlineLevel,
			Start: date(start), Finish: date(finish), Duration: dur(t.Duration), Complete: t.PercentComplete,
			Summary: t.Summary, Milestone: t.Milestone, Inactive: t.Inactive, Notes: t.Notes,
			Predecessors: make([]dependency, 0, len(t.Predecessors)), Resources: names[t.UniqueID]}
		if row.Resources == nil {
			row.Resources = []string{}
		}
		if t.Baseline != nil {
			row.BaselineStart, row.BaselineFinish = date(t.Baseline.Start), date(t.Baseline.Finish)
		}
		for _, r := range t.Predecessors {
			row.Predecessors = append(row.Predecessors, dependency{pf.TaskByID(r.PredecessorUniqueID).ID, r.Type.String(), dur(r.Lag)})
		}
		doc.Tasks = append(doc.Tasks, row)
	}
	for _, r := range pf.Resources {
		doc.Resources = append(doc.Resources, resource{r.ID, r.Name, r.Group, r.Type.String(), r.MaxUnits, r.Notes})
	}
	output, err := json.Marshal(doc)
	if err != nil {
		return fail("invalid-file")
	}
	if len(output) > 32*1024*1024 {
		return fail("resource-limit")
	}
	return string(output)
}
func main() {
	debug.SetMemoryLimit(256 * 1024 * 1024)
	js.Global().Set("anyfileParseMpp", js.FuncOf(parse))
	select {}
}
